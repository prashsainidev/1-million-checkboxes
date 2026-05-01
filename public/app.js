// public/app.js
const ws = new WebSocket(`ws://${window.location.host}`);
const grid = document.getElementById("checkboxGrid");
const toast = document.getElementById("toast");

// Browser ki jaan bachane ke liye hum 10,000 boxes render karenge
const TOTAL_BOXES = 10000;
const checkboxes = [];

// DOM mein element daalna slow hota hai, isliye hum Fragment use karenge (High Performance)
const fragment = document.createDocumentFragment();
for (let i = 0; i < TOTAL_BOXES; i++) {
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.dataset.index = i; // Har box ko ek number diya
  checkboxes.push(cb);
  fragment.appendChild(cb);
}
grid.appendChild(fragment);

// Jab bhi user kisi box par click kare
grid.addEventListener("change", (e) => {
  if (e.target.type === "checkbox") {
    const index = parseInt(e.target.dataset.index, 10);
    const state = e.target.checked;

    // Click hote hi socket ko batana (taki baki sabko pata chale)
    ws.send(JSON.stringify({ type: "TOGGLE", index, state }));
  }
});

// Redis Bitmaps decode karne ka formula
function isBitSet(bytes, index) {
  const byteIndex = Math.floor(index / 8);
  const bitOffset = 7 - (index % 8);
  if (byteIndex >= bytes.length) return false;
  return (bytes[byteIndex] & (1 << bitOffset)) !== 0;
}

// Jab server se koi message aaye
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "INIT") {
    // Database se data decode karke saare boxes set karna
    const binaryString = atob(msg.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    for (let i = 0; i < TOTAL_BOXES; i++) {
      checkboxes[i].checked = isBitSet(bytes, i);
    }
  }

  else if (msg.type === "UPDATE") {
    // Agar kisi aur ne box click kiya ho
    if (msg.index < TOTAL_BOXES) {
      checkboxes[msg.index].checked = msg.state;
    }
  }

    else if (msg.type === "ERROR") {
    // Jaise hi error aaye, jis box par click kiya tha usko wapas ulta (Revert) kar do
    if (msg.index !== undefined) {
      checkboxes[msg.index].checked = !msg.state;
    }

    // Laal (Red) alert dikhao
    toast.textContent = msg.message;
    toast.classList.remove("hidden");

    // 3 second baad alert hata lo
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 3000);
  }
};

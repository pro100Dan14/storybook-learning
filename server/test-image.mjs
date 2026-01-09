import fs from "fs";

const photoBase64 = fs.readFileSync("/tmp/child_base64.txt", "utf8");

const body = {
  pageText: "Забрёл Ваня в лес, да не простой, а волшебный.",
  imagePrompt:
    "Hand-painted children's book illustration, Russian folk tale style, a boy walking into an enchanted forest, warm muted watercolor, medium shot, no modern objects.",
  photoBase64,
  photoMimeType: "image/jpeg",
};

const res = await fetch("http://localhost:8787/api/image", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const raw = await res.text();
console.log("HTTP status:", res.status);

let data;
try {
  data = JSON.parse(raw);
} catch {
  console.log("Server returned non-JSON:");
  console.log(raw.slice(0, 800));
  process.exit(1);
}

if (!data.dataUrl) {
  console.error("No image returned:", data);
  process.exit(1);
}

fs.writeFileSync(
  "out.html",
  `<html><body><img style="max-width:900px" src="${data.dataUrl}" /></body></html>`
);

console.log("Saved preview to server/out.html");
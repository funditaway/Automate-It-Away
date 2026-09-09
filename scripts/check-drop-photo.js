#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function sendFn(src, label) {
  const start = src.indexOf("async function send()");
  if (start < 0) throw new Error(label + " missing send()");
  const end = src.indexOf("function copyDropShare", start);
  return src.slice(start, end > start ? end : start + 2800);
}

["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  const fn = sendFn(src, file);
  if (src.indexOf("async function attachFiles") < 0) throw new Error(file + " must attachFiles before send");
  if (fn.indexOf("attachFiles(item") < 0) throw new Error(file + " send() must attachFiles");
  if (src.indexOf("/api/upload") < 0) throw new Error(file + " must POST /api/upload");
  if (src.indexOf("photo.files") < 0) throw new Error(file + " must read #photo files");
  const upAt = src.indexOf("/api/upload");
  const jobsAt = fn.indexOf("/api/jobs");
  if (upAt < 0 || jobsAt < 0) throw new Error(file + " must upload then capture");
  if (src.indexOf("item.photoUrl") < 0) throw new Error(file + " must set photoUrl from upload");
});

const fields = read("api/_fields.js");
const start = fields.indexOf("function makeCapturedJob");
const fn = fields.slice(start, start + 1800);
if (fn.indexOf("src.files") < 0 || fn.indexOf("job.files") < 0) {
  throw new Error("makeCapturedJob must keep uploaded files on the card");
}

const api = require(path.join(root, "api/_fields"));
const job = api.makeCapturedJob("springfield-desk", { fields: [], people: [] }, {
  title: "Porch photo",
  notes: "Need a look",
  photoUrl: "/api/upload?id=file_1",
  files: [{ id: "file_1", name: "porch.jpg", type: "image/jpeg", kind: "photo", bytes: 12, url: "/api/upload?id=file_1" }]
});
if (job.photoUrl !== "/api/upload?id=file_1") throw new Error("capture must keep photoUrl");
if (!job.files || job.files[0].url !== "/api/upload?id=file_1") throw new Error("capture must keep files");

console.log("check-drop-photo: ok");

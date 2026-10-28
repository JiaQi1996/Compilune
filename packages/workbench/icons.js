const paths = {
  deduplicate: "M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10M9 3h10a2 2 0 0 1 2 2v9M9 3v11m0-11H8m4 14 3 3 6-7",
  plus: "M12 5v14M5 12h14",
  folder:
    "M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5",
  citation: "M7 3h10a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H9l-6 3V7a4 4 0 0 1 4-4ZM7 8h3v3H7ZM10 11c0 2-1 3-3 3M14 8h3v3h-3ZM17 11c0 2-1 3-3 3",
  search: "m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  // Lucide 0.468.0 settings (ISC); notices are bundled with the editor.
  settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
  play: "m8 4 13 8-13 8Z",
  stop: "M6 6h12v12H6Z",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  back: "m15 18-6-6 6-6",
  refresh:
    "M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 2M4 17l2 2a7 7 0 0 0 12-2",
  pin: "m16 3 5 5-4 1-3 6-2 2-5-5 2-2 6-3ZM2 22l7-7",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  outline: "M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01",
  pdf: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h4",
  minus: "M5 12h14",
  fit: "M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5M7 12h10m-3-3 3 3-3 3m-4-6-3 3 3 3",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h9V3M7 21v-7h10v7",
  panel: "M3 4h18v16H3ZM9 4v16",
  code: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18",
  sun: "M12 3v2M12 19v2M3 12h2M19 12h2m-2.6-7.4-1.4 1.4M6 18l-1.4 1.4M4.6 4.6 6 6m12 12 1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  check: "m5 12 4 4L19 6",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  download: "M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5",
  keyboard:
    "M3 5h18v14H3ZM7 9h.01M12 9h.01M17 9h.01M7 13h.01M12 13h.01M17 13h.01M8 16h8",
  archive: "M3 3h18v5H3ZM5 8v13h14V8M10 12h4",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  alert: "m12 3 10 18H2ZM12 9v4M12 17h.01",
  terminal: "m4 7 5 5-5 5M12 17h8",
};
export function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/>${name === "settings" ? '<circle cx="12" cy="12" r="3"/>' : ""}</svg>`;
}
export function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

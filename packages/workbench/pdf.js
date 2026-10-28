import * as pdfjs from "folio://app/pdf/build/pdf.mjs";
globalThis.pdfjsLib = pdfjs;
const { EventBus, PDFViewer, PDFLinkService, PDFFindController } = await import(
  "folio://app/pdf/web/pdf_viewer.mjs"
);
pdfjs.GlobalWorkerOptions.workerSrc = "folio://app/pdf/build/pdf.worker.mjs";

export class PDFPreview {
  constructor({ onReverse, onSession, onCover, onNotice }) {
    this.onReverse = onReverse;
    this.onSession = onSession;
    this.onCover = onCover;
    this.onNotice = onNotice;
    this.container = document.querySelector("#pdf-scroll");
    this.eventBus = new EventBus();
    this.linkService = new PDFLinkService({
      eventBus: this.eventBus,
      externalLinkEnabled: false,
    });
    this.findController = new PDFFindController({
      eventBus: this.eventBus,
      linkService: this.linkService,
    });
    this.viewer = new PDFViewer({
      container: this.container,
      viewer: document.querySelector("#pdf-pages"),
      eventBus: this.eventBus,
      linkService: this.linkService,
      findController: this.findController,
      textLayerMode: 1,
      annotationMode: 0,
      enableScripting: false,
    });
    this.linkService.setViewer(this.viewer);
    this.document = null;
    this.fitPadding = null;
    this.generation = 0;
    this.stale = true;
    this.session = {};
    this.eventBus.on("pagesinit", () => {
      if (!this.document) return;
      this.fit();
      if (
        this.session.pdfPage > 1 &&
        this.session.pdfPage <= this.document.numPages
      )
        this.viewer.currentPageNumber = this.session.pdfPage;
      this.update();
    });
    this.eventBus.on("pagechanging", (event) => {
      this.update();
      this.onSession({ pdfPage: event.pageNumber });
    });
    this.eventBus.on("scalechanging", (event) => {
      if (event.presetValue === "page-width") {
        const page = this.viewer.getPageView(this.viewer.currentPageNumber - 1);
        if (page?.width > 0)
          this.fitPadding = this.container.clientWidth - page.width;
      }
      this.update();
    });
    const updateFindCount = event => {
      const count = event.matchesCount || { current: 0, total: 0 };
      document.querySelector("#pdf-matches").textContent = `${count.current || 0} / ${count.total || 0}`;
    };
    this.eventBus.on("updatefindmatchescount", updateFindCount);
    this.eventBus.on("updatefindcontrolstate", updateFindCount);
    this.container.addEventListener("dblclick", (event) => this.reverse(event));
    new ResizeObserver(() => {
      if (
        this.document &&
        this.container.clientWidth > 0 &&
        this.viewer.currentScaleValue === "page-width"
      )
        this.fit();
      else this.update();
    }).observe(this.container);
  }
  async load(data, { stale = true, session = {} } = {}) {
    const generation = ++this.generation;
    this.stale = stale;
    this.session = session;
    this.find("");
    this.viewer.setDocument(null);
    this.linkService.setDocument(null);
    this.findController.setDocument(null);
    this.document = null;
    this.fitPadding = null;
    this.update();
    if (this.task) await this.task.destroy();
    document.querySelector("#pdf-empty").hidden = false;
    const task = pdfjs.getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      enableXfa: false,
      cMapUrl: "folio://app/pdf/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "folio://app/pdf/standard_fonts/",
      wasmUrl: "folio://app/pdf/wasm/",
      iccUrl: "folio://app/pdf/iccs/",
    });
    this.task = task;
    try {
      const doc = await task.promise;
      if (generation !== this.generation) {
        await doc.destroy();
        return;
      }
      this.document = doc;
      this.viewer.setDocument(doc);
      this.linkService.setDocument(doc);
      // PDFViewer sets the find document after its first rendered page.
      // Setting it here as well resets searches started during PDF loading.
      this.find(document.querySelector("#pdf-query").value);
      document.querySelector("#pdf-empty").hidden = true;
      this.update();
      const page = await doc.getPage(1),
        viewport = page.getViewport({ scale: 0.35 }),
        canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport })
        .promise;
      if (generation === this.generation)
        this.onCover(canvas.toDataURL("image/png"));
    } catch (error) {
      if (generation === this.generation)
        this.onNotice("PDF 载入失败：" + error.message);
    }
  }
  async clear() {
    this.generation++;
    this.document = null;
    this.fitPadding = null;
    this.find("");
    document.querySelector("#pdf-query").value = "";
    const task = this.task;
    this.task = null;
    this.viewer.setDocument(null);
    this.linkService.setDocument(null);
    this.findController.setDocument(null);
    document.querySelector("#pdf-empty").hidden = false;
    this.update();
    await task?.destroy();
  }

  update() {
    document.querySelector("#pdf-page-label").textContent = this.document
      ? `${this.viewer.currentPageNumber} / ${this.document.numPages}`
      : "— / —";
    const fitScale = this.fitWidthScale();
    document.querySelector("#pdf-scale").textContent = this.document && this.viewer.currentScale > 0 && fitScale > 0
      ? Math.round(this.viewer.currentScale / fitScale * 100) + "%"
      : "—";
  }
  fitWidthScale() {
    const page = this.viewer.getPageView(this.viewer.currentPageNumber - 1);
    if (!this.document || this.fitPadding === null || !page?.width || !page.scale) return 0;
    // Reuse PDF.js's measured fit-width gutter rather than hardcoding its
    // internal padding. The ratio stays valid while zoomed or resized.
    return Math.max(0, this.container.clientWidth - this.fitPadding) / page.width * page.scale;
  }
  fit() {
    if (this.document) this.viewer.currentScaleValue = "page-width";
  }
  zoom(delta) {
    if (!this.document) return;
    const fitScale = this.fitWidthScale();
    if (!(fitScale > 0)) return;
    const current = this.viewer.currentScale;
    const target = delta > 0
      ? Math.max(current, Math.min(fitScale * 4, current * 1.15))
      : Math.min(current, Math.max(fitScale * 0.25, current / 1.15));
    this.viewer.currentScale = target;
    this.onSession({ pdfZoom: this.viewer.currentScale });
  }
  async localImage(data) {
    const task = pdfjs.getDocument({ data, isEvalSupported: false, cMapUrl: "folio://app/pdf/cmaps/", cMapPacked: true, standardFontDataUrl: "folio://app/pdf/standard_fonts/", useSystemFonts: false });
    let doc;
    try {
      doc = await task.promise;
      const page = await doc.getPage(1), base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 900 / Math.max(base.width, base.height)) });
      const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport, background: "white" }).promise;
      return canvas.toDataURL("image/png");
    } finally { await task.destroy(); }
  }
  async referenceImage(locations) {
    if (!this.document || this.stale) throw Error("请先成功编译以生成准确预览");
    const doc = this.document, generation = this.generation;
    const number = Number(locations[0]?.Page), page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const f of locations.filter(f => Number(f.Page) === number)) {
      const x = Number(f.h ?? f.x), y = Number(f.v ?? f.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      x1 = Math.min(x1, x); y1 = Math.min(y1, y - Math.max(12, Math.abs(Number(f.H) || 16)));
      x2 = Math.max(x2, x + Math.max(20, Math.abs(Number(f.W) || 160))); y2 = Math.max(y2, y + Math.max(0, Number(f.D) || 4));
    }
    x1 = Math.max(0, x1 - 10); y1 = Math.max(0, y1 - 10);
    x2 = Math.min(viewport.width, x2 + 10); y2 = Math.min(viewport.height, y2 + 10);
    if (!(x2 > x1 && y2 > y1)) throw Error("无法预览此 PDF 区域");
    const scale = Math.min(2, 1200 / Math.max(x2 - x1, y2 - y1));
    const canvas = document.createElement("canvas"); canvas.width = Math.ceil((x2-x1)*scale); canvas.height = Math.ceil((y2-y1)*scale);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: page.getViewport({ scale }), transform: [1,0,0,1,-x1*scale,-y1*scale], background: "white" }).promise;
    if (generation !== this.generation || this.document !== doc || this.stale) throw Error("PDF 已变化，请重新预览");
    // SyncTeX boxes often span a full text line; trim blank margins so small
    // tables and centered figures remain readable in a compact preview card.
    const ctx = canvas.getContext("2d"), pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i+3] > 10 && Math.min(pixels[i], pixels[i+1], pixels[i+2]) < 245) {
        left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y);
      }
    }
    if (right >= left && bottom >= top) {
      left = Math.max(0,left-12); top = Math.max(0,top-12); right = Math.min(canvas.width-1,right+12); bottom = Math.min(canvas.height-1,bottom+12);
      const trimmed = document.createElement("canvas"); trimmed.width = right-left+1; trimmed.height = bottom-top+1;
      trimmed.getContext("2d").drawImage(canvas,left,top,trimmed.width,trimmed.height,0,0,trimmed.width,trimmed.height);
      return trimmed.toDataURL("image/png");
    }
    return canvas.toDataURL("image/png");
  }
  find(query, previous = false, again = false) {
    this.findQuery = query;
    if (!this.document) { document.querySelector("#pdf-matches").textContent = "0 / 0"; return; }
    this.eventBus.dispatch("find", {
      source: this,
      type: again ? "again" : "",
      query,
      phraseSearch: true,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false,
    });
    if (!query) document.querySelector("#pdf-matches").textContent = "0 / 0";
  }
  reverse(event) {
    if (!this.document) return;
    if (this.stale) {
      this.onNotice("当前 PDF 已过期，请先成功编译最新源码");
      return;
    }
    const pageElement = event.target.closest(".page");
    if (!pageElement) return;
    const number = Number(pageElement.dataset.pageNumber),
      view = this.viewer.getPageView(number - 1),
      rect = pageElement.getBoundingClientRect();
    const [x, y] = view.viewport.convertToPdfPoint(
        event.clientX - rect.left,
        event.clientY - rect.top,
      ),
      box = view.pdfPage.view;
    this.onReverse({ page: number, x: x - box[0], y: box[3] - y });
  }
  async locate(location) {
    if (!this.document) return;
    const page = await this.document.getPage(location.page),
      box = page.view,
      x = box[0] + location.x,
      y = box[3] - location.y;
    this.viewer.scrollPageIntoView({
      pageNumber: location.page,
      destArray: [null, { name: "XYZ" }, x, y, null],
      allowNegativeOffset: true,
    });
    setTimeout(() => {
      const view = this.viewer.getPageView(location.page - 1);
      if (!view) return;
      const [left, top] = view.viewport.convertToViewportPoint(x, y),
        marker = document.createElement("div");
      marker.className = "sync-marker";
      marker.style.left = left + "px";
      marker.style.top = top + "px";
      view.div.append(marker);
      setTimeout(() => marker.remove(), 2600);
    }, 180);
  }
}

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
    this.generation = 0;
    this.stale = true;
    this.session = {};
    this.eventBus.on("pagesinit", () => {
      this.viewer.currentScaleValue = "page-width";
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
    this.eventBus.on("scalechanging", () => this.update());
    this.eventBus.on("updatefindmatchescount", (event) => {
      document.querySelector("#pdf-matches").textContent = event.matchesCount
        .total
        ? `${event.matchesCount.current} / ${event.matchesCount.total}`
        : "无匹配";
    });
    this.container.addEventListener("dblclick", (event) => this.reverse(event));
    new ResizeObserver(() => {
      if (
        this.document &&
        this.container.clientWidth > 0 &&
        this.viewer.currentScaleValue === "page-width"
      )
        this.viewer.currentScaleValue = "page-width";
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
      this.findController.setDocument(doc);
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
    const task = this.task;
    this.task = null;
    this.viewer.setDocument(null);
    this.linkService.setDocument(null);
    this.findController.setDocument(null);
    document.querySelector("#pdf-empty").hidden = false;
    document.querySelector("#pdf-page-label").textContent = "— / —";
    await task?.destroy();
  }

  update() {
    document.querySelector("#pdf-page-label").textContent = this.document
      ? `${this.viewer.currentPageNumber} / ${this.document.numPages}`
      : "— / —";
    document.querySelector("#pdf-scale").textContent = this.document
      ? Math.round(this.viewer.currentScale * 100) + "%"
      : "适宽";
  }
  fit() {
    if (this.document) this.viewer.currentScaleValue = "page-width";
  }
  zoom(delta) {
    if (!this.document) return;
    this.viewer.currentScale = Math.max(
      0.25,
      Math.min(4, this.viewer.currentScale * (delta > 0 ? 1.15 : 1 / 1.15)),
    );
    this.onSession({ pdfZoom: this.viewer.currentScale });
  }
  find(query, previous = false, again = false) {
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
    if (!query) document.querySelector("#pdf-matches").textContent = "";
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

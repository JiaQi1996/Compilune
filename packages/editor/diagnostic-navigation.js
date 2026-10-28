import { StateEffect, StateField, EditorSelection } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
const markLine = StateEffect.define();
const diagnosticMark = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    if (tr.docChanged) value = Decoration.none;
    else value = value.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(markLine))
      value = effect.value == null ? Decoration.none : Decoration.set([
        Decoration.line({ class: "cm-diagnostic-line", attributes: { title: "编译错误位置" } }).range(effect.value),
      ]);
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
export const diagnosticNavigation = [diagnosticMark, EditorView.baseTheme({
  ".cm-diagnostic-line": { backgroundColor: "#c9756026 !important", boxShadow: "inset 3px 0 #c97560" },
})];
let clearTimer;
export function revealDiagnostic(view, number, column = 1) {
  const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, Math.trunc(Number(number) || 1))));
  const offset = Math.max(0, Math.trunc(Number(column) || 1) - 1);
  const position = Math.min(line.to, line.from + offset);
  view.dispatch({
    selection: EditorSelection.single(position),
    effects: [markLine.of(line.from), EditorView.scrollIntoView(position, { y: "center", x: "nearest", yMargin: 48 })],
  });
  clearTimeout(clearTimer);
  const doc = view.state.doc;
  clearTimer = setTimeout(() => {
    if (view.state.doc === doc) view.dispatch({ effects: markLine.of(null) });
  }, 3500);
}

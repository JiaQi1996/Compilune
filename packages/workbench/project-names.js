export const folderName = (path) => path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) || path;
export const projectNameKey = (name) => name.trim().normalize("NFKC").toLocaleLowerCase("en-US");
export const projectAlias = (project) => Object.hasOwn(project, "alias")
  ? project.alias || "" : project.name === folderName(project.path) ? "" : project.name;
export function aliasError(projects, alias, excluding = null) {
  if (typeof alias !== "string" || [...alias.trim()].length > 120 || /[\x00-\x1f\x7f]/.test(alias))
    return "项目别名无效，最多 120 个字符，不能包含换行或控制字符";
  const name = alias.trim();
  const conflict = name && projects.find((p) => p.id !== excluding && projectNameKey(p.name) === projectNameKey(name));
  return conflict ? `别名“${name}”已被其他项目使用，请设置不同别名。\n已有项目位置：${conflict.path}` : "";
}
export function defaultNameConflicts(projects, name, excluding = null) {
  return projects.filter((p) => p.id !== excluding &&
    (projectNameKey(folderName(p.path)) === projectNameKey(name) || projectNameKey(p.name) === projectNameKey(name)));
}

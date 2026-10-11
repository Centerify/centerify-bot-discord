export function getWarnRoleName(warnCount: number, template = "warn{count}") {
  return template.replace("{count}", String(warnCount));
}

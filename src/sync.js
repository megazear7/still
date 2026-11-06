export function decideExternal({ editor, disk, touched, incoming }) {
  if (typeof incoming !== 'string') return 'ignore'
  if (incoming === disk || incoming === editor) return 'sync'
  if (!touched) return 'reload'
  return 'ask'
}

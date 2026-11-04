export class Selection {
  constructor(ids = []) {this.set(ids);}
  set(ids) {this.ids = [...new Set(ids.filter(Boolean))]; this.anchor = this.ids.at(-1) ?? null;}
  get primary() {return this.ids.at(-1) ?? null;}
  has(id) {return this.ids.includes(id);}
  retain(entities) {const ids = new Set(entities.map(e => e.id)); this.ids = this.ids.filter(id => ids.has(id)); if (!ids.has(this.anchor)) this.anchor = this.primary;}
  choose(id, {toggle = false, range = false} = {}, visible = []) {
    if (!id) {if (!toggle && !range) this.set([]); return;}
    const a = visible.indexOf(this.anchor), b = visible.indexOf(id);
    if (range && a >= 0 && b >= 0) {
      const slice = visible.slice(Math.min(a,b), Math.max(a,b)+1);
      this.ids = [...new Set([...(toggle ? this.ids : []), ...slice])].filter(x => x !== id).concat(id);
    } else if (toggle) {
      this.ids = this.has(id) ? this.ids.filter(x => x !== id) : [...this.ids,id]; this.anchor = id;
    } else this.set([id]);
  }
}
export function editingText(target) {
  return !!target?.closest?.('input:not([data-selection-check]),textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
}

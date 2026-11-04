export function mountBook(parent, entity, game) {
  let page = 0;
  const frame = document.createElement("section");
  frame.className = "lore-book";
  frame.setAttribute("aria-label", entity.name);
  const author = document.createElement("div");
  author.className = "book-author";
  author.textContent = entity.book.author;
  frame.append(author);
  const ornament = document.createElement("div");
  ornament.className = "book-ornament";
  ornament.textContent = "◆ ───── ✦ ───── ◆";
  frame.append(ornament);
  const text = document.createElement("div");
  text.className = "book-page";
  text.setAttribute("aria-live", "polite");
  frame.append(text);
  const controls = document.createElement("nav");
  controls.className = "book-controls";
  controls.setAttribute("aria-label", "Страницы книги");
  const prev = document.createElement("button"),
    next = document.createElement("button"),
    count = document.createElement("span");
  prev.textContent = "← Назад";
  next.textContent = "Далее →";
  const draw = () => {
    text.textContent = entity.book.pages[page];
    count.textContent = `${page + 1} / ${entity.book.pages.length}`;
    prev.disabled = page === 0;
    next.disabled = page === entity.book.pages.length - 1;
  };
  prev.onclick = () => {
    page--;
    draw();
  };
  next.onclick = () => {
    page++;
    draw();
  };
  controls.append(prev, count, next);
  frame.append(controls);
  parent.append(frame);
  draw();
  const read = game.state.events?.readBooks;
  if (read && !read.includes(entity.id)) read.push(entity.id);
  return frame;
}

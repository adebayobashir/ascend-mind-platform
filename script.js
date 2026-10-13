const menu = document.getElementById("menu");
const links = document.getElementById("links");
menu.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  menu.setAttribute("aria-expanded", String(open));
  menu.textContent = open ? "✕" : "☰";
});
links.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    links.classList.remove("open");
    menu.setAttribute("aria-expanded", "false");
    menu.textContent = "☰";
  }),
);
document.getElementById("year").textContent = new Date().getFullYear();
document.getElementById("enrollForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const v = (id) => document.getElementById(id).value.trim();
  const lines = [
    "Hello Ascend Mind Institute, I would like to enquire about online classes.",
    "Parent/Guardian: " + v("guardian"),
    "Learner first name: " + (v("learner") || "Not provided"),
    "Learning level: " + v("level"),
    "Programme: " + v("programme"),
    "Preferred format: " + v("format"),
    "Learning goals: " + (v("message") || "Please advise on suitable classes."),
    "Please share availability, fees and the next steps.",
  ];
  const url =
    "https://wa.me/2348125599549?text=" + encodeURIComponent(lines.join("\n"));
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) window.location.href = url;
});

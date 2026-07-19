// Mobile nav toggle
const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("main-nav");

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

// Reveal sections as they scroll into view
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealed = document.querySelectorAll(".reveal");

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealed.forEach((el) => el.classList.add("shown"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("shown");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealed.forEach((el) => observer.observe(el));
}

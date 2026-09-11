const form = document.getElementById("inquiry-form");
const success = document.getElementById("form-success");

if (form && success) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    success.style.display = "block";
    form.querySelector('button[type="submit"]').disabled = true;
  });
}

const privacy = document.getElementById("privacy");
const privacyOpen = document.getElementById("privacy-open");
const privacyClose = document.getElementById("privacy-close");

if (privacy && privacyOpen && privacyClose) {
  privacyOpen.addEventListener("click", () => privacy.showModal());
  privacyClose.addEventListener("click", () => privacy.close());
}

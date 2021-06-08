var burgerContent = document.getElementById("burger-content");
var navBurger = document.getElementById("nav-burger");

function burgerClick() {
    if (burgerContent.classList.contains("burger-close")) {
        burgerContent.classList.remove("burger-close");
        navBurger.classList.remove("burger-change");
    }
    else {
        burgerContent.classList.add("burger-close");
        navBurger.classList.add("burger-change");
    }
}
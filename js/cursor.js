/*Custom Cursor*/
// window.addEventListener('mousemove', cursor);

// function cursor(e) {
//   // console.log(e)
//   let mouseCursor = document.querySelector(".cursor");

//   mouseCursor.style.top = e.pageY + "px";
//   mouseCursor.style.left = e.pageX + "px";
// }

/*Cursor Changes*/
var $c = $("[data-custom-cursor]");
var $h = $("a, button");
var $i = $("img");

$(window).on("mousemove", function (e) {
  x = e.clientX;
  y = e.clientY;
  // console.log(x, y);
  $c.css("transform", "matrix(1, 0, 0, 1, " + x + "," + y + ")");
});

$h.on("mouseenter", function (e) {
  $c.addClass("custom-cursor-active");
});

$h.on("mouseleave", function (e) {
  $c.removeClass("custom-cursor-active");
});

$i.on("mouseenter", function (e) {
  $c.addClass("custom-cursor-active-img");
});
$i.on("mouseleave", function (e) {
  $c.removeClass("custom-cursor-active-img");
});

const cursorCustom = document.getElementById('curr')

const nameTitle = document.querySelector(".name-title")

nameTitle.addEventListener("mouseenter", ()=> {
  
  cursorCustom.classList.remove('custom-cursor-active')
  cursorCustom.classList.toggle('custom-cursor-title')
})
nameTitle.addEventListener("mouseleave", ()=> {
  cursorCustom.classList.remove('custom-cursor-title')
})


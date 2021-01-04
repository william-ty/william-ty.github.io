/*Custom Cursor*/
window.addEventListener('mousemove', cursor);

function cursor(e) {
  // console.log(e)
  let mouseCursor = document.querySelector(".cursor");

  mouseCursor.style.top = e.pageY + "px";
  mouseCursor.style.left = e.pageX + "px";
}

/*Card Parallax*/
/*CSS ONLY*/

/*Slide Transition*/
$('a[href^="#"]').click(function (event) {
  var id = $(this).attr("href");
  var target = $(id).offset().top;
  $('html, body').animate({ scrollTop: target }, 500);
  event.preventDefault();
});

function getTargetTop(elem) {
  var id = elem.attr("href");
  var offset = 60;
  return $(id).offset().top - offset;
}

$(window).scroll(function (e) {
  isSelected($(window).scrollTop())
});

var sections = $('a[href^="#"]');

function isSelected(scrolledTo) {

  var threshold = 100;
  var i;

  for (i = 0; i < sections.length; i++) {
    var section = $(sections[i]);
    var target = getTargetTop(section);

    if (scrolledTo > target - threshold && scrolledTo < target + threshold) {
      sections.removeClass("active");
      section.addClass("active");
    }
  };
}

/*Loading*/
$(document).ready(function() {
});

$(window).on('load', function() {
  
  setTimeout(function() { 
    
    $('.loading').fadeOut('slow', function(){ 
      $(this).remove();
    });
    
  }, 2500);
});


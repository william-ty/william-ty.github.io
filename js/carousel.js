const tiles = document.querySelector('.tiles');
const scroller = tiles.querySelector('.scroller');
const nextBtn = tiles.querySelector('.btn-tv.next');
const prevBtn = tiles.querySelector('.btn-tv.prev');
const itemWidth = tiles.querySelector('.item').clientWidth;

nextBtn.addEventListener('click', scrollToNextItem);
prevBtn.addEventListener('click', scrollToPrevItem);

function scrollToNextItem() {
    if(scroller.scrollLeft < (scroller.scrollWidth - itemWidth))
        // The scroll position is not at the beginning of last item
        scroller.scrollBy({left: itemWidth, top: 0, behavior:'smooth'});
    else
        // Last item reached. Go back to first item by setting scroll position to 0
        scroller.scrollTo({left: 0, top: 0, behavior:'smooth'});
}
function scrollToPrevItem() {
    if(scroller.scrollLeft != 0)
        // The scroll position is not at the beginning of first item
        scroller.scrollBy({left: -itemWidth, top: 0, behavior:'smooth'});
    else
        // This is the first item. Go to last item by setting scroll position to scroller width
        scroller.scrollTo({left: scroller.scrollWidth, top: 0, behavior:'smooth'});
}

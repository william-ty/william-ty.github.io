const tl = gsap.timeline()
const projectsCarousel = document.querySelector('.scroller')

gsap.from('.name-letter', {delay: 0, opacity: 0, duration: 2, ease: 'CredentialsContainer.easeOut'})

gsap.from('.name-title', {delay: 1, opacity: 0, duration: 1})
gsap.from('.lastname-title', {delay: 1.5, opacity: 0, duration: 1})

gsap.from('.brush-interactive', {delay: 2, opacity: 0, duration: 1})
gsap.from('.brush-creative', {delay: 2, opacity: 0, duration: 1})
gsap.from('h3', {delay: 2, opacity: 0, duration: 1.5})

gsap.from('.temp', {delay: 4, duration: 4, opacity: 0})
gsap.from('.socials', {delay: 2, duration: 2, opacity: 0})
gsap.from('.rights', {delay: 2, duration: 2, opacity: 0})

// gsap.from('.tiles', {delay: 2.5, duration: 2, opacity: 0, y: '-50rem', rotate: '6deg', ease:Bounce.easeOut, })


tl.from(".tiles", {duration: 2.5, y: -500, ease: Bounce.easeOut})
    .from(".tiles", {duration: 2, opacity: "0"}, "-=2.5")
    .to(".tiles", {duration: 1.4, rotate: '20deg'}, "-=3")
    .to(".tiles", {duration: 1.2, rotate: '-10deg'}, "-=1.6")
    .to(".tiles", {duration: 0.6, rotate: '6deg'}, "-=0.7")
    .to(".tiles", {duration: 0.4, rotate: '0deg'}, "-=0.2")

tl.from(".tv-help", 1.0, { y: -822, ease: Bounce.easeOut });
tl.to(".tv-help", 1.0, { y: 10, x: -10, repeat:-1, yoyo:true });

// tl.from(".tiles", {duration: 2.5, y: -500, ease: Bounce.easeOut})
//     .from(".tiles", {duration: 2, opacity: "0"}, "-=2.5")
//     .to(".tiles", {duration: 1.4, rotate: '20deg'}, "-=3")
//     .to(".tiles", {duration: 0.5, rotate: '-10deg'}, ">")
    // .to(".tiles", {duration: 0.5, rotate: '5deg'}, "-=1.5")

// .to(".tiles", {duration: 1.5, delay: 0.5, rotate: '-6deg'}, "-=2.7").to(".tiles", {duration: 1.5, delay: 0.5, rotate: '0deg'}, "-=1.5");

// to(".tiles", {duration: 0.5, rotate: '-10deg', repeat:3, yoyo:true}, "-=2.5");


// gsap.to('.tiles', {delay: 2.5, duration: 2, opacity: 0, y: '-50rem', ease:Bounce.easeOut, })

/* ANIMATION OF LETTER */
const nameLetter = document.querySelector('.name-letter-background')

// // Mouse
// document.addEventListener('mousemove', animateNameLetter)

// let mouseX = 0
// let mouseY = 0

// function animateNameLetter(event) {
//     mouseY = event.clientY
//     mouseX = event.clientX
// }

// const tick = () =>
// {

//     nameLetter.style.left = ((mouseX*0.001)+48)+'%'
//     nameLetter.style.top = ((mouseY*0.002)-31)+'%'

//     // Call tick again on the next frame
//     window.requestAnimationFrame(tick)
// }

// tick()


/* Help Disappear */
// const projectsBtns = document.querySelectorAll(".btn").forEach(element => {
//     addEventListener("click", ()=> {
//         document.querySelector(".tv-help").style.display = "none"
//     })   
// });
const projectsBtns = document.querySelectorAll(".btn")

for (let index = 0; index < projectsBtns.length; index++) {
    const element = projectsBtns[index];
    element.addEventListener("click", ()=> {
        document.querySelector(".tv-help").style.display = "none"
    })   
};

console.log(projectsBtns)
// projectsBtns.forEach(element => {console.log(element)})
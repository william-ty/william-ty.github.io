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

gsap.from('.tiles', {delay: 3, duration: 2, opacity: 0, x: '5rem'})

/* ANIMATION OF LETTER */
const nameLetter = document.querySelector('.name-letter-background')

// Mouse
document.addEventListener('mousemove', animateNameLetter)

let mouseX = 0
let mouseY = 0

function animateNameLetter(event) {
    mouseY = event.clientY
    mouseX = event.clientX
}

const tick = () =>
{

    nameLetter.style.left = ((mouseX*0.001)+48)+'%'
    nameLetter.style.top = ((mouseY*0.002)-31)+'%'

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()

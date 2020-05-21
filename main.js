function onReady() {
	// Handle theme switching via light switch
	let darkMode = localStorage.getItem('lightswitch') === 'dark'
	const lightswitch = document.querySelector('.lightswitch')
	const lightswitchIcon = lightswitch.querySelector('i')
	function updateTheme() {
		lightswitchIcon.classList.remove('fa-moon', 'fa-sun')
		lightswitchIcon.classList.add(darkMode ? 'fa-moon' : 'fa-sun')

		document.body.classList.toggle('dark', darkMode)
	}
	updateTheme()
	lightswitch.addEventListener('click', function() {
		darkMode = !darkMode
		localStorage.setItem('lightswitch', darkMode ? 'dark' : 'light')
		updateTheme()
	})

	// Set target=_blank on all external links
	for (link of document.querySelectorAll('a')) {
		if (link.hostname === window.location.hostname) {
			continue
		}

		link.target = '_blank'
		link.rel = 'noopener noreferrer'
	}
}

document.readyState != 'loading'
	? onReady()
	: document.addEventListener('DOMContentLoaded', onReady)

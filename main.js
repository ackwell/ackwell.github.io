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

	// Extract the language of code blocks and add as a data attribute for use from css
	for (const langElem of document.querySelectorAll('[class*="language-"]')) {
		let language
		for (const className of langElem.classList) {
			if (!className.startsWith('language-')) { return }
			language = className.split('-')[1]
			break
		}

		let codeElem = langElem
		if (codeElem.tagName.toLowerCase() !== 'code') {
			codeElem = langElem.querySelector('code')
		}

		codeElem.setAttribute('data-language', language)
	}

	// Set target=_blank on all external links
	for (const link of document.querySelectorAll('a')) {
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

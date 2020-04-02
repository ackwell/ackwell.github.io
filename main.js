function onReady() {
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

document.addEventListener('DOMContentLoaded', () => {
    const videoButton = document.getElementById('startVideoChat');
    const textButton = document.getElementById('startTextChat');
    const termsPopup = document.getElementById('termsPopup');
    const acceptTermsBtn = document.getElementById('acceptTerms');
    const cancelTermsBtn = document.getElementById('cancelTerms');
    const popupCheckboxes = document.querySelectorAll('.terms-popup .term-item input[type="checkbox"]');
    const termsLink = document.querySelector('.terms-link');
    const privacyLink = document.querySelector('.privacy-link');
    
    // Animate online counter if not already being handled
    if (typeof animateCounter === 'function' && document.getElementById('onlineCount')) {
        animateCounter();
    }
    
    // Add animation for sections
    document.querySelectorAll('section').forEach((section, index) => {
        section.style.animationDelay = `${index * 0.1}s`;
    });

    // Enable buttons by default
    videoButton.disabled = false;
    textButton.disabled = false;
    videoButton.classList.add('ready');
    textButton.classList.add('ready');

    let currentChatMode = ''; // Variable to store selected chat type

    // Handle video chat button
    videoButton.addEventListener('click', () => {
        currentChatMode = 'video';
        showTermsPopup();
    });

    // Handle text chat button
    textButton.addEventListener('click', () => {
        currentChatMode = 'text';
        showTermsPopup();
    });

    // Function to display popup
    function showTermsPopup() {
        termsPopup.style.display = 'block';
        document.body.style.overflow = 'hidden';
        // Reset checkboxes when opening popup
        popupCheckboxes.forEach(checkbox => checkbox.checked = false);
        acceptTermsBtn.disabled = true;
    }

    // Function to close popup and reset form
    function closePopup() {
        termsPopup.style.display = 'none';
        document.body.style.overflow = 'auto';
        popupCheckboxes.forEach(checkbox => checkbox.checked = false);
        acceptTermsBtn.disabled = true;
        currentChatMode = ''; // Reset chat mode
    }

    // Handle cancel button
    cancelTermsBtn.addEventListener('click', () => {
        closePopup();
    });

    // Check checkbox status in popup
    function checkPopupTerms() {
        const allChecked = Array.from(popupCheckboxes).every(checkbox => checkbox.checked);
        acceptTermsBtn.disabled = !allChecked;
    }

    // Add event listeners for checkboxes in popup
    popupCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', checkPopupTerms);
    });

    // Handle accept button
    acceptTermsBtn.addEventListener('click', () => {
        localStorage.setItem('termsAccepted', 'true');
        localStorage.setItem('chatMode', currentChatMode);
        closePopup();
        startChat(currentChatMode === 'video' ? videoButton : textButton);
    });

    // Close popup when clicking outside
    termsPopup.addEventListener('click', (e) => {
        if (e.target === termsPopup) {
            closePopup();
        }
    });

    function startChat(button) {
        // Show loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'block';
        document.body.style.overflow = 'hidden';

        // Disable button
        button.disabled = true;

        // Redirect after 1 second
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
            document.body.style.overflow = 'auto';
            button.disabled = false;
            window.location.href = './chat.html';
        }, 1000);
    }

    // Handle terms and privacy links
    termsLink?.addEventListener('click', () => {
        localStorage.setItem('lastPage', window.location.href);
    });

    privacyLink?.addEventListener('click', () => {
        localStorage.setItem('lastPage', window.location.href);
    });

    // Add hover effects for feature items
    document.querySelectorAll('.feature-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'scale(1.1)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'scale(1)';
        });
    });

    // Logo click event for home navigation
    const logo = document.querySelector('.logo, .logo-image');
    if (logo) {
        logo.addEventListener('click', () => {
            window.location.href = './index.html';
        });
    }
    
    // Add smooth section transitions on scroll
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const appearOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('appear');
            observer.unobserve(entry.target);
        });
    }, observerOptions);
    
    document.querySelectorAll('section').forEach(section => {
        section.classList.add('fade-in-section');
        appearOnScroll.observe(section);
    });
}); 
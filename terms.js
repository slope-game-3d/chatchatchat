document.addEventListener('DOMContentLoaded', () => {
    const backButton = document.querySelector('.back-button');
    
    backButton.addEventListener('click', (e) => {
        e.preventDefault();
        const lastPage = localStorage.getItem('lastPage');
        if (lastPage) {
            window.location.href = lastPage;
        } else {
            window.location.href = 'index.html';
        }
    });
}); 
// تأثير Hover على الأزرار (Optional)
document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('mouseover', () => btn.style.transform = 'scale(1.05)');
    btn.addEventListener('mouseout', () => btn.style.transform = 'scale(1)');
});

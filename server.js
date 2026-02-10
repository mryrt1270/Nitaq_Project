const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 30000;

// إعدادات EJS و Public
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// محرك القواعد البسيط
let rules = [
    { entity: "الجهة A", data: "البيانات B", allowed: true },
    { entity: "الجهة C", data: "البيانات B", allowed: false }
];

// مصفوفة Timeline
let requests = [];

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.render('index');
});

// التحقق
app.post('/check', (req, res) => {
    const { entity, data } = req.body;
    let rule = rules.find(r => r.entity === entity && r.data === data);
    let result = rule ? (rule.allowed ? '✅ قانوني' : '❌ غير قانوني') : '⚠️ تحذير';

    requests.push({ entity, data, result, time: new Date().toLocaleString() });

    res.render('result', { entity, data, result });
});

// Timeline
app.get('/timeline', (req, res) => {
    res.render('timeline', { requests });
});

// Admin
app.get('/admin', (req, res) => {
    res.render('admin', { rules });
});

app.post('/admin', (req, res) => {
    const { entity, data, allowed } = req.body;
    rules.push({ entity, data, allowed: allowed === 'true' });
    res.redirect('/admin');
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


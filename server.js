// ================== SETUP ==================
const express = require('express');
const bodyParser = require('body-parser'); // 🔥 فوق
const path = require('path');
const session = require('express-session'); // 🔥 فوق
const fs = require('fs');

const app = express();

// 🔥 بعدها تستخدمهم
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'nitaq-secret',
    resave: false,
    saveUninitialized: false
}));

const PORT = process.env.PORT || 30000;


// ================== FILE STORAGE ==================

function loadData(filePath, defaultData) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        const data = fs.readFileSync(filePath, 'utf-8');
        if (!data.trim()) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        return JSON.parse(data);
    } catch {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
}

function saveData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const rulesPath = './data/rules.json';
const usersPath = './data/users.json';
const requestsPath = './data/requests.json';
const logsPath = './data/logs.json';

let rules = loadData(rulesPath, []);
let users = loadData(usersPath, []);
let requests = loadData(requestsPath, []);
let auditLogs = loadData(logsPath, []);

// إنشاء حساب المؤسس لو غير موجود
if (!users.find(u => u.email === "owner@nitaq.sa")) {
    users.push({
        name: "تركي",
        email: "owner@nitaq.sa",
        password: "Nn2030",
        role: "founder",
        banned: false,
        permissions: ["manage_users"],
        createdAt: new Date().toLocaleString(),
        lastLogin: null,
        promotedAt: null,
        loginCount: 0,
        achievements: []
    });
    saveData(usersPath, users);
}


// ================== HELPERS ==================

function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user ||
        (req.session.user.role !== "admin" &&
         req.session.user.role !== "founder")) {
        return res.send("🚫 غير مصرح");
    }
    next();
}

function requireFounder(req, res, next) {
    if (!req.session.user || req.session.user.role !== "founder")
        return res.send("🚫 هذه الصفحة للمؤسس فقط");
    next();
}

function addLog(action, target, byUser) {
    auditLogs.push({
        action,
        target,
        by: byUser.email,
        time: new Date().toLocaleString()
    });
    saveData(logsPath, auditLogs);
}

function isDuplicateRule(rule) {
    return rules.some(r =>
        r.sector === rule.sector &&
        r.entity === rule.entity &&
        r.data.trim().toLowerCase() === rule.data.trim().toLowerCase()
    );
}

// ================== AUTH ==================

app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null });
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.get('/register', (req, res) => {
    res.render('register', {
        error: null,
        success: null
    });
});

app.post('/register', (req, res) => {

    const { name, email, password, confirmPassword } = req.body;

    // 1) التحقق من الحقول
    if (!name || !email || !password || !confirmPassword) {
        return res.render('register', { error: "جميع الحقول مطلوبة" });
    }

    // 2) تطابق كلمتي المرور
    if (password !== confirmPassword) {
        return res.render('register', { error: "كلمتا المرور غير متطابقتين" });
    }

    // 3) التحقق إن الإيميل غير مستخدم
    if (users.find(u => u.email === email)) {
        return res.render('register', { error: "البريد مستخدم بالفعل" });
    }

    // 4) 🔥 التحقق من "كل" شروط كلمة المرور
    const condEnglish = /[A-Za-z]/.test(password);    // فيها حروف إنجليزية
    const condSpecial = /[@#$&]/.test(password);      // فيها رمز خاص واحد على الأقل @ # $ &
    const condUpper   = /^[A-Z]/.test(password);      // تبدأ بحرف Capital
    const condNumber  = /\d/.test(password);          // فيها رقم
    const condLength  = password.length >= 8;         // ٨ خانات أو أكثر

    const allOk = condEnglish && condSpecial && condUpper && condNumber && condLength;

    if (!allOk) {
        return res.render('register', {
            error: "كلمة المرور لا تحقق جميع الشروط.\nتأكد من استيفاء الشروط الخمسة أسفل حقل كلمة المرور."
        });
    }

    // 5) لو وصل هنا → كل شيء تمام، نسجل الحساب
    users.push({
        name,
        email,
        password,
        role: "user",
        banned: false,
        permissions: [],
        createdAt: new Date().toLocaleString(),
        lastLogin: null,
        promotedAt: null,
        loginCount: 0
    });

    saveData(usersPath, users);
    addLog("إنشاء حساب جديد", email, { email: "self-register" });

    res.redirect('/login');
});

app.post('/login', (req, res) => {

    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);

    if (!user)
        return res.render('login', { error: "بيانات غير صحيحة" });

    if (user.banned)
        return res.render('login', { error: "🚫 حسابك محظور" });

    user.lastLogin = new Date().toLocaleString();
    user.loginCount = (user.loginCount || 0) + 1;
    saveData(usersPath, users);

    req.session.user = user;

    res.redirect('/home');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// ================== HOME ==================

app.get('/home', requireLogin, (req, res) => {
    const user = req.session.user;

    const userRequests = requests.filter(r => r.userEmail === user.email);

    const totalRequests = userRequests.length;

    const rejected = userRequests.filter(r => !r.allowed).length;

    const rejectionRate = totalRequests === 0
        ? 0
        : Math.round((rejected / totalRequests) * 100);

    const recentRequests = userRequests.slice(-5).reverse();

    res.render('home', {
        user,
        totalRequests,
        rejectionRate,
        recentRequests
    });
});


app.post('/profile/change-password', requireLogin, (req, res) => {

    const { currentPassword, newPassword } = req.body;

    const user = users.find(u => u.email === req.session.user.email);
    if (!user) return res.redirect('/home');

    // 1) تأكيد كلمة المرور الحالية
    if (user.password !== currentPassword) {
        return res.render('profile', {
            user,
            error: "كلمة المرور الحالية غير صحيحة",
            success: null
        });
    }

    // 2) التحقق من وجود كلمة المرور الجديدة
    if (!newPassword) {
        return res.render('profile', {
            user,
            error: "فضلاً أدخل كلمة مرور جديدة",
            success: null
        });
    }

    // 3) 🔥 نفس الشروط الخمسة
    const condEnglish = /[A-Za-z]/.test(newPassword);    // فيها حروف إنجليزية
    const condSpecial = /[@#$&]/.test(newPassword);      // فيها رمز من @ # $ &
    const condUpper   = /^[A-Z]/.test(newPassword);      // تبدأ بحرف Capital
    const condNumber  = /\d/.test(newPassword);          // فيها رقم
    const condLength  = newPassword.length >= 8;         // ٨ خانات أو أكثر

    const allOk = condEnglish && condSpecial && condUpper && condNumber && condLength;

    if (!allOk) {
        return res.render('profile', {
            user,
            error: "كلمة المرور الجديدة لا تحقق جميع الشروط المطلوبة.\nتأكد من استيفاء الشروط الخمسة الظاهرة أسفل حقل كلمة المرور.",
            success: null
        });
    }

    // 4) حفظ كلمة المرور الجديدة
    user.password = newPassword;
    saveData(usersPath, users);

    addLog("تغيير كلمة المرور", user.email, user);

    res.render('profile', {
        user,
        success: "تم تغيير كلمة المرور بنجاح ✅",
        error: null
    });
});


app.post('/api/check', requireLogin, (req, res) => {

    const { sector, entity, data } = req.body;

    const match = rules.find(r =>
        r.sector === sector &&
        r.entity === entity &&
        r.data.trim().toLowerCase() === data.trim().toLowerCase()
    );

    const allowed = match ? match.allowed : false;

    const response = {
        allowed,
        sector,
        entity,
        data,
        reason: allowed
            ? "يوجد نص نظامي يجيز هذا الطلب."
            : "لا يوجد نص نظامي يسمح بهذا الطلب.",
        time: new Date().toLocaleString(),
        verificationId: "NTQ-" + Date.now()
    };

requests.push({
    userEmail: req.session.user.email,
    sector,
    entity,
    data,
    allowed,
    time: response.time,
    verificationId: response.verificationId,
});

saveData(requestsPath, requests);
res.json(response);
});

// ================== SERVICES PAGE ==================

app.get('/services', requireLogin, (req, res) => {
    res.render('services', {
        user: req.session.user,
        rules
    });
});

// ================== LOGS ==================

app.get('/logs', requireFounder, (req, res) => {
    res.render('logs', {
        user: req.session.user,
        logs: auditLogs
    });
});

// ================== PROFILE ==================

app.get('/profile', requireLogin, (req, res) => {

    const user = users.find(u => u.email === req.session.user.email);

    if (!user) {
        return res.redirect('/home');
    }

    res.render('profile', {
        user,
        success: null,
        error: null
    });

});

// ================== SECRET PAGE ==================

app.get('/secret', requireLogin, (req, res) => {
    const {
        allowed,
        sector,
        entity,
        data,
        reason,
        time,
        verificationId
    } = req.query;

    if (typeof allowed === "undefined") {
        return res.redirect('/services');
    }

    res.render('secret', {
        user: req.session.user,
        allowed: allowed === "true",
        sector,
        entity,
        data,
        reason,
        time,
        verificationId
    });
});

// ================== USERS ==================

app.get('/users', requireFounder, (req, res) => {

    const search = req.query.search || "";
    const filter = req.query.filter || "all";

    // ✅ هنا التعريف الصحيح
    let filteredUsers = [...users];

    if (search) {
        filteredUsers = filteredUsers.filter(u =>
            u.email.toLowerCase().includes(search.toLowerCase())
        );
    }

    if (filter !== "all") {
        filteredUsers = filteredUsers.filter(u => u.role === filter);
    }

    // ✅ الترتيب
    filteredUsers.sort((a, b) => {
        const order = { founder: 0, admin: 1, user: 2 };
        return order[a.role] - order[b.role];
    });

    res.render('users', {
        users: filteredUsers,
        currentUser: req.session.user,
        totalPages: 1,
        currentPage: 1,
        search,
        filter
    });
});

// تغيير الاسم
app.post('/users/change-name', requireFounder, (req, res) => {
    const { email, newName } = req.body;
    const user = users.find(u => u.email === email);
    if (user) {
        user.name = newName;
        saveData(usersPath, users);
        addLog("تغيير الاسم", email, req.session.user);
    }
    res.redirect('/users');
});

// تغيير الدور
app.post('/users/role', requireFounder, (req, res) => {
    const { email, role } = req.body;
    const user = users.find(u => u.email === email);
    if (user) {
        user.role = role;
        saveData(usersPath, users);
        addLog("تغيير الدور", email, req.session.user);
    }
    res.redirect('/users');
});

// منح / إزالة صلاحية
app.post('/users/toggle-permission', requireFounder, (req, res) => {
    const { email } = req.body;
    const user = users.find(u => u.email === email);
    if (user) {
        user.permissions = user.permissions || [];
        if (user.permissions.includes("manage_users")) {
            user.permissions = user.permissions.filter(p => p !== "manage_users");
        } else {
            user.permissions.push("manage_users");
        }
        saveData(usersPath, users);
        addLog("تعديل صلاحيات", email, req.session.user);
    }
    res.redirect('/users');
});

// حظر
app.post('/users/ban', requireFounder, (req, res) => {
    const { email } = req.body;
    const user = users.find(u => u.email === email);
    if (user) {
        user.banned = true;
        saveData(usersPath, users);
        addLog("حظر مستخدم", email, req.session.user);
    }
    res.redirect('/users');
});

// فك الحظر
app.post('/users/unban', requireFounder, (req, res) => {
    const { email } = req.body;
    const user = users.find(u => u.email === email);
    if (user) {
        user.banned = false;
        saveData(usersPath, users);
        addLog("فك حظر مستخدم", email, req.session.user);
    }
    res.redirect('/users');
});

// حذف
app.post('/users/delete', requireFounder, (req, res) => {
    const { email } = req.body;
    users = users.filter(u => u.email !== email);
    saveData(usersPath, users);
    addLog("حذف مستخدم", email, req.session.user);
    res.redirect('/users');
});

// ================== ADMIN (إدارة القواعد) ==================

app.get('/admin', requireAdmin, (req, res) => {
    res.render('admin', {
        user: req.session.user,
        rules
    });
});

// إضافة قاعدة جديدة
app.post('/admin/rules/add', requireAdmin, (req, res) => {

    const { sector, entity, data, allowed } = req.body;

    rules.push({
        id: Date.now(),
        sector,
        entity,
        data,
        allowed: allowed === "true"
    });

    saveData(rulesPath, rules);
    addLog("إضافة قاعدة", entity, req.session.user);

    res.redirect('/admin');
});

// حذف قاعدة
app.post('/admin/rules/delete', requireAdmin, (req, res) => {

    const { id } = req.body;

    rules = rules.filter(r => r.id != id);
    saveData(rulesPath, rules);

    addLog("حذف قاعدة", id, req.session.user);

    res.redirect('/admin');
});


// ================== DASHBOARD ==================

app.get('/dashboard', requireAdmin, (req, res) => {

    // كل الطلبات في النظام (للمؤسس/الأدمن فقط)
    res.render('dashboard', {
        user: req.session.user,
        requests
    });
});


// ================== TIMELINE ==================

app.get('/timeline', requireLogin, (req, res) => {

    const userRequests = requests.filter(
        r => r.userEmail === req.session.user.email
    );

    res.render('timeline', {
        user: req.session.user,
        requests: userRequests
    });
});

// ================== START ==================

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
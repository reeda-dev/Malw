// =============================================
        // Firebase + Firestore
        // =============================================
        import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
        import {
            getFirestore,
            doc,
            getDoc,
            setDoc,
            onSnapshot
        } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

        const firebaseConfig = {
            apiKey: "AIzaSyD5l7NOkDlE9bnG81cRB0bGwhBc44JDabw",
            authDomain: "egg-store-68ee4.firebaseapp.com",
            projectId: "egg-store-68ee4",
            storageBucket: "egg-store-68ee4.firebasestorage.app",
            messagingSenderId: "140927588957",
            appId: "1:140927588957:web:66c40b2aab6152d4db8bb4"
        };

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const DB_REF = doc(firestore, "egg_store", "main");

        // =========================
        // قاعدة البيانات الافتراضية
        // =========================
        const defaultDB = {
            stock: 0,
            prices: { large: 150, medium: 145, small: 140 },
            customers: [],
            suppliers: [],
            sales: [],
            returns: [],
            orders: [],
            wastage: [],
            inventoryMovements: [],
            inventoryResetAt: 0
        };

        let db = normalizeDB(defaultDB);
        let databaseReady = false;

        // حماية عامة من تكرار أي عملية حفظ أثناء بطء الإنترنت.
        // كل العمليات التي تعدّل البيانات تمر من هنا قبل تنفيذ التغيير.
        let mutationInProgress = false;

        function beginMutation(trigger = null) {
            if (mutationInProgress) {
                return null;
            }

            mutationInProgress = true;
            const snapshot = structuredClone(db);

            document.querySelectorAll('form button[type="submit"], [data-mutation-action], .inventory-reset-btn').forEach(btn => {
                btn.disabled = true;
                btn.dataset.mutationLocked = '1';
            });

            if (trigger && trigger.tagName === 'BUTTON') {
                trigger.dataset.mutationOriginalText = trigger.textContent;
                trigger.textContent = 'جاري الحفظ...';
            }

            return snapshot;
        }

        function endMutation(success, snapshot = null, trigger = null) {
            if (!success && snapshot) {
                // لو الحفظ فشل، نرجع كل التعديلات المحلية التي تمت قبل الحفظ.
                db = normalizeDB(snapshot);
                updateUI();
            }

            document.querySelectorAll('[data-mutation-locked="1"]').forEach(btn => {
                btn.disabled = false;
                delete btn.dataset.mutationLocked;
            });

            if (trigger && trigger.tagName === 'BUTTON' && trigger.dataset.mutationOriginalText) {
                trigger.textContent = trigger.dataset.mutationOriginalText;
                delete trigger.dataset.mutationOriginalText;
            }

            mutationInProgress = false;
        }

        // أرقام تسلسلية ثابتة للأسماء (الزبائن / الموردين / الطلبات).
        // الأرقام القديمة تُستكمل تلقائيًا، وأي إضافة جديدة تأخذ الرقم التالي.
        function normalizeSerialList(list) {
            const items = Array.isArray(list) ? list : [];
            const used = new Set();
            let maxSerial = 0;

            // نحافظ على الأرقام الصحيحة والفريدة الموجودة بالفعل.
            items.forEach(item => {
                const n = Number(item?.serial);
                if (Number.isInteger(n) && n > 0 && !used.has(n)) {
                    used.add(n);
                    maxSerial = Math.max(maxSerial, n);
                }
            });

            // أي عنصر قديم بدون رقم (أو برقم مكرر) يأخذ رقمًا جديدًا.
            return items.map(item => {
                const n = Number(item?.serial);
                if (Number.isInteger(n) && n > 0 && !used.has(`assigned:${n}`)) {
                    used.add(`assigned:${n}`);
                    return { ...item, serial: n };
                }
                maxSerial += 1;
                while (used.has(maxSerial) || used.has(`assigned:${maxSerial}`)) maxSerial += 1;
                used.add(maxSerial);
                used.add(`assigned:${maxSerial}`);
                return { ...item, serial: maxSerial };
            });
        }

        function getNextSerial(list) {
            return (Array.isArray(list) ? list : []).reduce((max, item) => {
                const n = Number(item?.serial);
                return Number.isInteger(n) && n > max ? n : max;
            }, 0) + 1;
        }

        function normalizeDB(data) {
            return {
                ...structuredClone(defaultDB),
                ...(data || {}),
                prices: {
                    ...defaultDB.prices,
                    ...((data && data.prices) || {})
                },
                customers: normalizeSerialList(Array.isArray(data?.customers) ? data.customers : []).map(c => ({
                    ...c,
                    balance: Number(c.balance || 0),
                    creditBalance: Number(c.creditBalance || 0)
                })),
                suppliers: normalizeSerialList(Array.isArray(data?.suppliers) ? data.suppliers : []).map(s => ({
                    ...s,
                    id: Number(s.id || Date.now()),
                    name: String(s.name || ''),
                    phone: String(s.phone || ''),
                    notes: String(s.notes || '')
                })),
                sales: Array.isArray(data?.sales) ? data.sales : [],
                returns: Array.isArray(data?.returns) ? data.returns : [],
                orders: normalizeSerialList(Array.isArray(data?.orders) ? data.orders : []),
                wastage: Array.isArray(data?.wastage) ? data.wastage : [],
                inventoryMovements: Array.isArray(data?.inventoryMovements) ? data.inventoryMovements : [],
                inventoryResetAt: Number(data?.inventoryResetAt || 0)
            };
        }

        // =========================
        // التاريخ + اليوم
        // =========================
        const WEEK_DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

        function getDateObject(dateValue, timestamp) {
            if (timestamp) {
                const d = new Date(Number(timestamp));
                if (!Number.isNaN(d.getTime())) return d;
            }
            if (dateValue instanceof Date) return dateValue;
            const raw = String(dateValue || '').trim();
            const normalizedRaw = raw.replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)));
            const match = normalizedRaw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
            if (match) {
                const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                if (!Number.isNaN(d.getTime())) return d;
            }
            return new Date();
        }

        function formatDateWithDay(dateValue, timestamp) {
            const d = getDateObject(dateValue, timestamp);
            const dateText = dateValue || d.toLocaleDateString('ar-EG');
            const dayText = WEEK_DAYS_AR[d.getDay()];
            return `<div class="date-with-day"><span class="date-main">${escapeHTML(String(dateText))}</span><span class="date-day">${dayText}</span></div>`;
        }

        function nowMeta() {
            const timestamp = Date.now();
            return { date: new Date(timestamp).toLocaleDateString('ar-EG'), timestamp };
        }

        function addInventoryMovement({ type, trays, customerId = null, customerName = '', price = 0, total = 0, reason = '', source = '' }) {
            db.inventoryMovements.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                type,
                trays: Number(trays) || 0,
                customerId,
                customerName,
                price: Number(price) || 0,
                total: Number(total) || 0,
                reason,
                source,
                ...nowMeta()
            });
        }

        // قراءة البيانات من Firestore عند بداية التشغيل
        async function loadDB() {
            try {
                const snapshot = await getDoc(DB_REF);

                if (!snapshot.exists()) {
                    db = structuredClone(defaultDB);
                    await setDoc(DB_REF, db);
                } else {
                    db = normalizeDB(snapshot.data());
                }

                databaseReady = true;
                updateUI();
                console.log("Firebase database loaded successfully");
            } catch (error) {
                console.error("Firebase load error:", error);
                alert("تعذر الاتصال بقاعدة البيانات. تأكد من Firestore Rules واتصال الإنترنت.\n\n" + (error?.code || error?.message || "Unknown error"));
            }
        }

        // حفظ البيانات في Firestore بدل localStorage
        async function saveDB(previousState = null) {
            if (!databaseReady) {
                alert("قاعدة البيانات لم تجهز بعد، حاول مرة أخرى بعد لحظات.");
                return false;
            }

            try {
                await setDoc(DB_REF, db);
                updateUI();
                return true;
            } catch (error) {
                console.error("Firebase save error:", error);
                if (previousState) {
                    db = normalizeDB(previousState);
                    updateUI();
                }
                alert("فشل حفظ البيانات في Firebase.\n\n" + (error?.code || error?.message || "Unknown error") + "\n\nتأكد من Firestore Rules وأنها تسمح بالقراءة والكتابة.");
                return false;
            }
        }

        // تحديث البيانات لحظيًا إذا تغيرت من جهاز أو Tab آخر
        onSnapshot(DB_REF, (snapshot) => {
            if (snapshot.exists()) {
                db = normalizeDB(snapshot.data());
                databaseReady = true;
                updateUI();
            }
        }, (error) => {
            console.error("Firebase realtime listener error:", error);
        });

        // =========================
        // دخول الإدارة
        // =========================
        const ADMIN_PASSWORD = "123";

        function promptAdminLogin() {
            const pwd = prompt("أدخل كلمة المرور لدخول لوحة الإدارة:");
            if (pwd === ADMIN_PASSWORD) {
                toggleAdminMode(true);
            } else if (pwd !== null) {
                alert("كلمة المرور غير صحيحة!");
            }
        }

        function toggleAdminMode(isAdmin) {
            if (isAdmin) {
                document.body.classList.add('admin-mode');
                document.getElementById('adminHeader').style.display = 'flex';
                switchTab('ordersView', document.querySelectorAll('.nav-btn')[1]);
            } else {
                document.body.classList.remove('admin-mode');
                document.getElementById('adminHeader').style.display = 'none';
                switchTab('homeView', document.querySelectorAll('.nav-btn')[0]);
            }
        }

        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('open');
        }

        function switchTab(tabId, btn) {
            document.querySelectorAll('.tab-view').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

            const tab = document.getElementById(tabId);
            if (tab) tab.classList.add('active');
            if (btn) btn.classList.add('active');

            document.getElementById('sidebar').classList.remove('open');

            if (tabId === 'statement') renderStatement();
        }

        // =========================
        // أدوات مساعدة
        // =========================
        function getNumber(id) {
            return parseFloat(document.getElementById(id).value) || 0;
        }

        function escapeHTML(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // =========================
        // طلبات الزبون أونلاين
        // =========================
        function calcOnlineOrder() {
            const type = document.getElementById('orderType').value;
            const trays = getNumber('orderTrays');
            const unitPrice = Number(db.prices[type]) || 0;
            const total = trays * unitPrice;

            document.getElementById('orderTotalDisplay').innerText = total + " ج.م";
        }

        async function submitOnlineOrder(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const type = document.getElementById('orderType').value;
            const trays = parseInt(document.getElementById('orderTrays').value, 10);

            if (!trays || trays < 1) {
                alert('أدخل عدد أطباق صحيح!');
                return;
            }

            const unitPrice = Number(db.prices[type]) || 0;

            const typeNames = {
                large: 'بيض كبير',
                medium: 'بيض وسط',
                small: 'بيض صغير'
            };

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.orders.push({
                id: Date.now(),
                serial: getNextSerial(db.orders),
                name: document.getElementById('orderName').value.trim(),
                phone: document.getElementById('orderPhone').value.trim(),
                address: document.getElementById('orderAddress').value.trim(),
                type: type,
                typeName: typeNames[type],
                trays: trays,
                unitPrice: unitPrice,
                total: trays * unitPrice,
                status: 'pending',
                ...nowMeta()
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                calcOnlineOrder();
                alert('تم إرسال طلبك بنجاح! سنتواصل معك قريباً لتأكيد التوصيل.');
            }
        }

        // =========================
        // تحديث الأسعار
        // =========================
        async function updatePrices(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const large = getNumber('setPriceLarge');
            const medium = getNumber('setPriceMedium');
            const small = getNumber('setPriceSmall');

            if (large <= 0 || medium <= 0 || small <= 0) {
                alert('يجب إدخال أسعار أكبر من صفر!');
                return;
            }

            // تأكد أن prices موجودة حتى لو كانت وثيقة Firestore القديمة ناقصة
            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db = normalizeDB(db);
            db.prices = { large, medium, small };

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                alert('تم تحديث أسعار البيض بنجاح!');
                calcOnlineOrder();
            }
        }

        async function markOrderComplete(orderId) {
            const order = db.orders.find(o => o.id === orderId);

            if (order) {
                const mutationSnapshot = beginMutation();
                if (!mutationSnapshot) return;

                order.status = 'completed';
                const saved = await saveDB(mutationSnapshot);
                endMutation(saved, mutationSnapshot);
            }
        }

        // =========================
        // البيع
        // =========================
        function calcSale() {
            const trays = getNumber('saleTrays');
            const price = getNumber('salePrice');
            const paid = getNumber('salePaid');

            const total = trays * price;
            const remaining = Math.max(0, total - paid);

            document.getElementById('saleTotal').innerText = total;
            document.getElementById('saleRemaining').innerText = remaining;
        }

        async function addSale(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const customerNameInput = document.getElementById('saleCustomerInput').value.trim();
            const customer = db.customers.find(c => c.name.trim() === customerNameInput);

            if (!customer) {
                alert('يرجى اختيار زبون صحيح من القائمة أولاً!');
                return;
            }

            const trays = parseInt(document.getElementById('saleTrays').value, 10);
            const price = parseFloat(document.getElementById('salePrice').value);
            const paid = parseFloat(document.getElementById('salePaid').value) || 0;

            if (!trays || trays < 1) {
                alert('أدخل عدد أطباق صحيح!');
                return;
            }

            if (!price || price <= 0) {
                alert('أدخل سعر صحيح!');
                return;
            }

            const total = trays * price;

            if (paid < 0 || paid > total) {
                alert('المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي الفاتورة.');
                return;
            }

            if (db.stock < trays) {
                alert('المخزون غير كافٍ!');
                return;
            }

            const remainingBeforeCredit = total - paid;
            const creditUsed = Math.min(Number(customer.creditBalance || 0), remainingBeforeCredit);
            const remaining = remainingBeforeCredit - creditUsed;

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.stock -= trays;
            customer.creditBalance = Math.max(0, Number(customer.creditBalance || 0) - creditUsed);
            customer.balance = Number(customer.balance || 0) + remaining;

            db.sales.push({
                id: Date.now(),
                customerId: customer.id,
                trays,
                price,
                total,
                paid,
                creditUsed,
                remaining,
                returnedTrays: 0,
                type: 'sale',
                ...nowMeta()
            });

            addInventoryMovement({
                type: 'sale',
                trays,
                customerId: customer.id,
                customerName: customer.name,
                price,
                total,
                reason: `بيع للزبون ${customer.name}`,
                source: 'فاتورة بيع'
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                calcSale();
                alert('تم حفظ الفاتورة بنجاح!');
            }
        }

        // =========================
        // العملاء
        // =========================
        async function addCustomer(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const name = document.getElementById('custName').value.trim();
            const phone = document.getElementById('custPhone').value.trim();

            if (!name) {
                alert('أدخل اسم الزبون!');
                return;
            }

            const exists = db.customers.some(c =>
                c.name.trim().toLowerCase() === name.toLowerCase()
            );

            if (exists) {
                alert('هذا الزبون موجود بالفعل!');
                return;
            }

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.customers.push({
                id: Date.now(),
                serial: getNextSerial(db.customers),
                name,
                phone,
                balance: 0,
                creditBalance: 0
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                alert('تم حفظ الزبون بنجاح!');
            }
        }

        // =========================
        // المزارع / الموردين
        // =========================
        async function addSupplier(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const name = document.getElementById('supplierName').value.trim();
            const phone = document.getElementById('supplierPhone').value.trim();

            if (!name) {
                alert('أدخل اسم صاحب المزرعة!');
                return;
            }

            const exists = db.suppliers.some(s =>
                String(s.name || '').trim().toLowerCase() === name.toLowerCase()
            );

            if (exists) {
                alert('هذا المورد موجود بالفعل!');
                return;
            }

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.suppliers.push({
                id: Date.now(),
                serial: getNextSerial(db.suppliers),
                name,
                phone
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                alert('تم حفظ المورد بنجاح!');
            }
        }

        function getSupplierMatches() {
            const q = String(document.getElementById('purchaseSupplierInput')?.value || '').trim().toLowerCase();
            if (!q) return db.suppliers.slice();
            return db.suppliers.filter(s =>
                String(s.name || '').toLowerCase().includes(q) ||
                String(s.phone || '').toLowerCase().includes(q)
            );
        }

        function searchPurchaseSupplier() {
            const box = document.getElementById('purchaseSupplierResults');
            if (!box) return;

            const q = String(document.getElementById('purchaseSupplierInput')?.value || '').trim();
            const matches = getSupplierMatches();

            if (!q && !document.activeElement?.matches('#purchaseSupplierInput')) {
                box.style.display = 'none';
                return;
            }

            if (!matches.length) {
                box.style.display = 'block';
                box.innerHTML = '<div class="search-empty">لا يوجد مورد مطابق</div>';
                return;
            }

            box.style.display = 'block';
            box.innerHTML = matches.slice(0, 20).map(s => `
                <button type="button" class="search-result-item" onclick="selectPurchaseSupplier(${s.id})">
                    <b>${Number(s.serial || 0)} - ${escapeHTML(s.name)}</b>
                    <span>${escapeHTML(s.phone || '')}</span>
                </button>
            `).join('');
        }

        function selectPurchaseSupplier(id) {
            const supplier = db.suppliers.find(s => Number(s.id) === Number(id));
            if (!supplier) return;

            document.getElementById('purchaseSupplier').value = supplier.id;
            document.getElementById('purchaseSupplierInput').value = supplier.name;

            const box = document.getElementById('purchaseSupplierResults');
            if (box) {
                box.style.display = 'none';
                box.innerHTML = '';
            }
        }

        function filterSuppliers() {
            const q = String(document.getElementById('supplierSearch')?.value || '').trim().toLowerCase();
            const rows = db.suppliers.filter(s =>
                !q ||
                String(s.name || '').toLowerCase().includes(q) ||
                String(s.phone || '').toLowerCase().includes(q)
            );

            const table = document.getElementById('suppliersTable');
            if (!table) return;

            table.innerHTML = rows.length ? rows.map(s => {
                return `
                    <tr>
                        <td><b>${Number(s.serial || 0)}</b></td>
                        <td><b>${escapeHTML(s.name)}</b></td>
                        <td>${escapeHTML(s.phone || '-')}</td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="3" style="text-align:center;">لا يوجد موردون مطابقون للبحث</td></tr>';
        }

        function calcPurchase() {
            const trays = getNumber('purTrays');
            const price = getNumber('purPrice');
            const total = trays * price;
            const el = document.getElementById('purchaseTotalDisplay');
            if (el) el.innerText = total;
        }

        // =========================
        // المشتريات والمخزون
        // =========================
        async function addPurchase(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const supplierId = Number(document.getElementById('purchaseSupplier').value || 0);
            const supplier = db.suppliers.find(s => Number(s.id) === supplierId);
            const trays = parseInt(document.getElementById('purTrays').value, 10);
            const price = getNumber('purPrice');
            const total = trays * price;

            if (!supplier) {
                alert('اختر صاحب المزرعة أولًا!');
                return;
            }

            if (!trays || trays < 1) {
                alert('أدخل عدد الأطباق بشكل صحيح!');
                return;
            }

            if (!price || price <= 0) {
                alert('لا يمكن تسجيل الشراء بدون سعر الطبق. أدخل سعرًا صحيحًا أولًا!');
                document.getElementById('purPrice')?.focus();
                return;
            }

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.stock += trays;
            addInventoryMovement({
                type: 'purchase',
                trays,
                price,
                total,
                supplierId: supplier.id,
                supplierName: supplier.name,
                source: 'شراء من مزرعة',
                reason: `شراء ${trays} طبق من ${supplier.name}`
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                document.getElementById('purchaseSupplier').value = '';
                document.getElementById('purchaseSupplierInput').value = '';
                calcPurchase();
                alert(`تمت إضافة ${trays} طبق للمخزن من ${supplier.name}!`);
            }
        }

        async function addWastage(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const trays = parseInt(document.getElementById('wasteTrays').value, 10);
            const reason = document.getElementById('wasteReason').value.trim();

            if (!trays || trays < 1) {
                alert('أدخل كمية صحيحة!');
                return;
            }

            if (db.stock < trays) {
                alert('الكمية المراد خصمها أكبر من المخزون!');
                return;
            }

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.stock -= trays;
            addInventoryMovement({
                type: 'wastage',
                trays,
                reason,
                source: 'تالف / كسر'
            });

            db.wastage.push({
                id: Date.now(),
                trays,
                reason,
                ...nowMeta()
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                alert('تم خصم الكسر من المخزن!');
            }
        }

        // =========================
        // تحصيل الديون
        // =========================
        async function payDebt(custId) {
            const customer = db.customers.find(c => c.id === custId);

            if (!customer) return;

            if (customer.balance <= 0) {
                alert('لا يوجد دين مستحق على هذا الزبون.');
                return;
            }

            const amount = parseFloat(
                prompt(`أدخل المبلغ المحصل من الزبون (المستحق: ${customer.balance} ج.م):`)
            );

            if (!amount || amount <= 0) return;

            if (amount > customer.balance) {
                alert('المبلغ المحصل أكبر من الدين المستحق.');
                return;
            }

            const mutationSnapshot = beginMutation();
            if (!mutationSnapshot) return;

            const originalBalance = Number(customer.balance);
            customer.balance -= amount;
            const remainingAfterPayment = Number(customer.balance);

            db.sales.push({
                id: Date.now(),
                customerId: custId,
                trays: 0,
                price: 0,
                total: originalBalance,
                paid: amount,
                remaining: remainingAfterPayment,
                originalBalance,
                remainingAfterPayment,
                type: 'payment',
                ...nowMeta()
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot);
            if (saved) {
                if (selectedStatementCustomerId === custId) renderStatement();
                alert(`تم تسجيل التحصيل بنجاح! المتبقي على ${customer.name}: ${remainingAfterPayment} ج.م`);
            }
        }

        // =========================
        // المرتجعات
        // =========================
        function getCustomerSalesForReturn(customerId) {
            return db.sales
                .filter(s => s.type === 'sale' && s.customerId === customerId)
                .map(s => ({
                    ...s,
                    returnedTrays: Number(s.returnedTrays || 0),
                    availableTrays: Math.max(0, Number(s.trays || 0) - Number(s.returnedTrays || 0))
                }))
                .filter(s => s.availableTrays > 0)
                .sort((a, b) => Number(b.timestamp || b.id || 0) - Number(a.timestamp || a.id || 0));
        }

        function getReturnCustomerMatches() {
            const input = document.getElementById('returnCustomerInput');
            const q = String(input?.value || '').trim().toLowerCase();
            if (!q) return db.customers.slice();
            return db.customers.filter(c => {
                const name = String(c.name || '').toLowerCase();
                const phone = String(c.phone || '').toLowerCase();
                return name.includes(q) || phone.includes(q);
            });
        }

        function renderReturnCustomerResults() {
            const box = document.getElementById('returnCustomerResults');
            const input = document.getElementById('returnCustomerInput');
            if (!box || !input) return;

            const q = String(input.value || '').trim();
            const matches = getReturnCustomerMatches();

            if (!q) {
                box.style.display = 'none';
                box.innerHTML = '';
                return;
            }

            box.style.display = 'block';
            if (!matches.length) {
                box.innerHTML = '<div style="padding:12px;text-align:center;color:#64748b;">لا يوجد زبون مطابق</div>';
                return;
            }

            box.innerHTML = matches.slice(0, 20).map(c => `
                <button type="button" onclick="selectReturnCustomer(${c.id})"
                    style="display:block;width:100%;text-align:right;padding:10px 12px;border:0;border-bottom:1px solid #eee;background:#fff;cursor:pointer;">
                    <b>${Number(c.serial || 0)} - ${escapeHTML(c.name)}</b>
                    <span style="color:#64748b;margin-right:8px;">${escapeHTML(c.phone || '')}</span>
                    <span style="float:left;font-weight:bold;">${Number(c.balance || 0)} ج.م</span>
                </button>
            `).join('');
        }

        function selectReturnCustomer(customerId) {
            const customer = db.customers.find(c => Number(c.id) === Number(customerId));
            if (!customer) return;

            const input = document.getElementById('returnCustomerInput');
            const hidden = document.getElementById('returnCustomer');
            const box = document.getElementById('returnCustomerResults');
            if (input) input.value = customer.name;
            if (hidden) hidden.value = String(customer.id);
            if (box) { box.style.display = 'none'; box.innerHTML = ''; }
            updateReturnSalesOptions();
        }

        function handleReturnCustomerInput() {
            const input = document.getElementById('returnCustomerInput');
            const hidden = document.getElementById('returnCustomer');
            if (!input || !hidden) return;

            const typedName = input.value.trim().toLowerCase();
            const customer = db.customers.find(c => String(c.name || '').trim().toLowerCase() === typedName);
            hidden.value = customer ? String(customer.id) : '';
            renderReturnCustomerResults();
            updateReturnSalesOptions();
        }

        function updateReturnSalesOptions() {
            const customerId = Number(document.getElementById('returnCustomer')?.value || 0);
            const saleSelect = document.getElementById('returnSale');
            if (!saleSelect) return;

            if (!customerId) {
                saleSelect.innerHTML = '<option value="">اختر الزبون أولاً</option>';
                updateReturnPreview();
                return;
            }

            const sales = getCustomerSalesForReturn(customerId);
            saleSelect.innerHTML = sales.length
                ? '<option value="">اختر الفاتورة</option>' + sales.map(s =>
                    `<option value="${s.id}">فاتورة #${s.id} - ${s.date || '-'} - ${s.trays} طبق - ${s.total} ج.م (متاح ${s.availableTrays})</option>`
                  ).join('')
                : '<option value="">لا توجد كميات متاحة للمرتجع</option>';
            updateReturnPreview();
        }

        function updateReturnPreview() {
            const saleId = Number(document.getElementById('returnSale')?.value || 0);
            const sale = db.sales.find(s => Number(s.id) === saleId && s.type === 'sale');
            const qtyInput = document.getElementById('returnTrays');
            const info = document.getElementById('returnInfo');
            const value = document.getElementById('returnValue');
            if (!sale) {
                if (info) info.innerHTML = 'اختر الفاتورة لعرض الكمية المتاحة والسعر.';
                if (value) value.innerText = '0';
                if (qtyInput) qtyInput.max = '';
                return;
            }
            const available = Math.max(0, Number(sale.trays || 0) - Number(sale.returnedTrays || 0));
            if (qtyInput) {
                qtyInput.max = String(available);
                if (Number(qtyInput.value) > available) qtyInput.value = available;
            }
            const qty = Number(qtyInput?.value || 0);
            const total = qty * Number(sale.price || 0);
            if (info) info.innerHTML = `المباع: <b>${sale.trays}</b> طبق — المرتجع السابق: <b>${Number(sale.returnedTrays || 0)}</b> — المتاح للمرتجع: <b>${available}</b> — سعر الطبق: <b>${sale.price} ج.م</b>`;
            if (value) value.innerText = total;
        }

        async function addReturn(e) {
            e.preventDefault();
            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const customerId = Number(document.getElementById('returnCustomer').value || 0);
            const saleId = Number(document.getElementById('returnSale').value || 0);
            const trays = parseInt(document.getElementById('returnTrays').value, 10);
            const reason = document.getElementById('returnReason').value.trim();
            const customer = db.customers.find(c => Number(c.id) === customerId);
            const sale = db.sales.find(s => Number(s.id) === saleId && s.type === 'sale' && Number(s.customerId) === customerId);

            if (!customer || !sale) {
                alert('اختر الزبون والفاتورة بشكل صحيح.');
                return;
            }

            const alreadyReturned = Number(sale.returnedTrays || 0);
            const available = Number(sale.trays || 0) - alreadyReturned;
            if (!trays || trays < 1) {
                alert('أدخل كمية مرتجع صحيحة.');
                return;
            }
            if (trays > available) {
                alert(`لا يمكن إرجاع أكثر من ${available} طبق من هذه الفاتورة.`);
                return;
            }

            const returnValue = trays * Number(sale.price || 0);

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            // رجوع البضاعة للمخزن.
            db.stock += trays;

            // تعديل الفاتورة الأصلية مع الاحتفاظ بسجل المرتجع المستقل.
            sale.returnedTrays = alreadyReturned + trays;
            sale.netTotal = Math.max(0, Number(sale.total || 0) - sale.returnedTrays * Number(sale.price || 0));

            // المرتجع يقلل الدين أولاً، وأي مبلغ زائد يتحول لرصيد مستحق للزبون.
            const debtReduction = Math.min(Number(customer.balance || 0), returnValue);
            const creditAdded = returnValue - debtReduction;
            customer.balance = Math.max(0, Number(customer.balance || 0) - debtReduction);
            customer.creditBalance = Number(customer.creditBalance || 0) + creditAdded;

            const meta = nowMeta();
            const returnRecord = {
                id: Date.now(),
                customerId: customer.id,
                customerName: customer.name,
                saleId: sale.id,
                trays,
                price: Number(sale.price || 0),
                total: returnValue,
                debtReduction,
                creditAdded,
                reason,
                type: 'return',
                ...meta
            };

            db.returns.push(returnRecord);

            addInventoryMovement({
                type: 'return',
                trays,
                customerId: customer.id,
                customerName: customer.name,
                price: Number(sale.price || 0),
                total: returnValue,
                reason: reason || `مرتجع من فاتورة #${sale.id}`,
                source: 'مرتجع مبيعات'
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                updateReturnSalesOptions();
                if (selectedStatementCustomerId === customer.id) renderStatement();
                alert(`تم تسجيل المرتجع بقيمة ${returnValue} ج.م وإرجاع ${trays} طبق للمخزن.`);
            }
        }

        // =========================
        // البحث في الزبائن وكشف الحساب
        // =========================
        let selectedStatementCustomerId = null;

        function filterCustomers() {
            const input = document.getElementById('customerSearch');
            const q = (input?.value || '').trim().toLowerCase();
            const rows = db.customers.filter(c => {
                const name = String(c.name || '').toLowerCase();
                const phone = String(c.phone || '').toLowerCase();
                return !q || name.includes(q) || phone.includes(q);
            });

            document.getElementById('customersTable').innerHTML = rows.length ? rows.map(c => `
                <tr>
                    <td><b>${Number(c.serial || 0)}</b></td>
                    <td>${escapeHTML(c.name)}</td>
                    <td>${escapeHTML(c.phone || '-')}</td>
                    <td style="font-weight:bold">${Number(c.balance || 0)} ج.م${Number(c.creditBalance || 0) ? `<br><small class="credit-text">له: ${Number(c.creditBalance || 0)} ج.م</small>` : ''}</td>
                    <td><button data-mutation-action="1" onclick="payDebt(${c.id})" style="padding:6px 12px; cursor:pointer; background:var(--primary); color:#fff; border:none; border-radius:6px;">سداد</button></td>
                </tr>
            `).join('') : '<tr><td colspan="5" style="text-align:center;">لا يوجد زبون مطابق للبحث</td></tr>';
        }

        function getStatementMatches() {
            const q = (document.getElementById('statementSearch')?.value || '').trim().toLowerCase();
            if (!q) return db.customers.slice();
            return db.customers.filter(c => {
                const name = String(c.name || '').toLowerCase();
                const phone = String(c.phone || '').toLowerCase();
                return name.includes(q) || phone.includes(q);
            });
        }

        function renderStatementSearchResults() {
            const box = document.getElementById('statementSearchResults');
            if (!box) return;
            const q = (document.getElementById('statementSearch')?.value || '').trim();
            const matches = getStatementMatches();

            if (!q) {
                box.style.display = 'none';
                box.innerHTML = '';
                return;
            }

            if (!matches.length) {
                box.style.display = 'block';
                box.innerHTML = '<div style="padding:12px;text-align:center;color:#64748b;">لا يوجد زبون مطابق</div>';
                return;
            }

            box.style.display = 'block';
            box.innerHTML = matches.slice(0, 20).map(c => `
                <button type="button" onclick="selectStatementCustomer(${c.id})"
                    style="display:block;width:100%;text-align:right;padding:10px 12px;border:0;border-bottom:1px solid #eee;background:#fff;cursor:pointer;">
                    <b>${Number(c.serial || 0)} - ${escapeHTML(c.name)}</b>
                    <span style="color:#64748b;margin-right:8px;">${escapeHTML(c.phone || '')}</span>
                    <span style="float:left;font-weight:bold;">${Number(c.balance || 0)} ج.م</span>
                </button>
            `).join('');
        }

        function selectStatementCustomer(custId) {
            const customer = db.customers.find(c => c.id === custId);
            if (!customer) return;
            selectedStatementCustomerId = custId;
            const input = document.getElementById('statementSearch');
            if (input) input.value = customer.name;
            const box = document.getElementById('statementSearchResults');
            if (box) { box.style.display = 'none'; box.innerHTML = ''; }
            renderStatement();
        }

        // Live Search: البحث يعمل مع كل ضغطة بدون زر بحث.
        function searchStatementCustomer() {
            const matches = getStatementMatches();
            const q = (document.getElementById('statementSearch')?.value || '').trim();
            renderStatementSearchResults();
            if (!q) {
                selectedStatementCustomerId = null;
                renderStatement();
                return;
            }
            // لو فيه تطابق كامل أو زبون واحد فقط، افتح كشفه فورًا.
            const exact = matches.find(c =>
                String(c.name || '').trim().toLowerCase() === q.toLowerCase() ||
                String(c.phone || '').trim().toLowerCase() === q.toLowerCase()
            );
            if (exact) selectStatementCustomer(exact.id);
            else if (matches.length === 1) selectStatementCustomer(matches[0].id);
        }

        function renderStatement() {
            const customer = db.customers.find(c => c.id === selectedStatementCustomerId);
            if (!customer) {
                document.getElementById('statementTable').innerHTML = '<tr><td colspan="8" style="text-align:center;">اكتب اسم الزبون أو رقمه واختره من النتائج</td></tr>';
                document.getElementById('custStatementTitle').innerText = 'كشف حساب';
                return;
            }

            const events = [
                ...db.sales.filter(s => s.customerId === customer.id).map(s => ({ ...s, eventTime: Number(s.timestamp || s.id || 0) })),
                ...db.returns.filter(r => r.customerId === customer.id).map(r => ({ ...r, eventTime: Number(r.timestamp || r.id || 0) }))
            ].sort((a, b) => a.eventTime - b.eventTime);

            let runningBalance = 0;
            let runningCredit = 0;
            let totalSales = 0;
            let totalPaid = 0;
            let totalReturns = 0;
            const rows = [];

            // إجمالي المرتجعات المرتبطة بكل فاتورة، لاستخدامها في حساب
            // "المتبقي من المبايعة" بشكل مستقل عن إجمالي مديونية الزبون.
            const returnsBySale = {};
            db.returns
                .filter(r => r.customerId === customer.id)
                .forEach(r => {
                    const saleId = Number(r.saleId || 0);
                    if (!saleId) return;
                    returnsBySale[saleId] = (returnsBySale[saleId] || 0) + Number(r.total || 0);
                });

            events.forEach(h => {
                if (h.type === 'payment') {
                    const payment = Number(h.paid || 0);
                    runningBalance = Math.max(0, runningBalance - payment);
                    totalPaid += payment;
                    rows.push({
                        date: h.date, timestamp: h.timestamp, type: 'تحصيل دفعة',
                        trays: '-', price: '-', total: '-', paid: payment,
                        remaining: runningBalance, saleRemaining: '-',
                        credit: runningCredit
                    });
                    return;
                }

                if (h.type === 'return') {
                    const value = Number(h.total || 0);
                    runningBalance = Math.max(0, runningBalance - Number(h.debtReduction || 0));
                    runningCredit += Number(h.creditAdded || 0);
                    totalReturns += value;
                    const linkedSale = db.sales.find(s => Number(s.id) === Number(h.saleId || 0) && s.customerId === customer.id);
                    const linkedSaleOriginalRemaining = linkedSale
                        ? Math.max(0, Number(linkedSale.total || 0) - Number(linkedSale.paid || 0) - Number(linkedSale.creditUsed || 0))
                        : 0;
                    const linkedSaleReturned = linkedSale ? Number(returnsBySale[Number(linkedSale.id)] || 0) : value;
                    const linkedSaleRemaining = linkedSale
                        ? Math.max(0, linkedSaleOriginalRemaining - linkedSaleReturned)
                        : '-';
                    rows.push({
                        date: h.date, timestamp: h.timestamp, type: 'مرتجع',
                        trays: `-${h.trays}`, price: h.price ? h.price + ' ج.م' : '-',
                        total: -value, paid: '-', remaining: runningBalance,
                        saleRemaining: linkedSaleRemaining, credit: runningCredit
                    });
                    return;
                }

                const total = Number(h.total || 0);
                const paid = Number(h.paid || 0);
                const creditUsed = Number(h.creditUsed || 0);
                const invoiceRemaining = Math.max(0, total - paid - creditUsed);
                runningCredit = Math.max(0, runningCredit - creditUsed);
                runningBalance += invoiceRemaining;
                totalSales += total;
                totalPaid += paid;

                // المتبقي الخاص بهذه الفاتورة فقط = متبقي الفاتورة بعد
                // خصم أي مرتجعات مرتبطة بها، دون إدخال ديون قديمة للزبون.
                const saleReturnedValue = Number(returnsBySale[Number(h.id)] || 0);
                const saleRemaining = Math.max(0, invoiceRemaining - saleReturnedValue);

                rows.push({
                    date: h.date, timestamp: h.timestamp, type: 'فاتورة بيع',
                    trays: h.trays || '-', price: h.price ? h.price + ' ج.م' : '-',
                    total, paid, remaining: runningBalance,
                    saleRemaining, credit: runningCredit
                });
            });

            const currentBalance = Number(customer.balance || 0);
            const currentCredit = Number(customer.creditBalance || 0);
            document.getElementById('custStatementTitle').innerHTML =
                `كشف حساب: ${escapeHTML(customer.name)}
                <div class="statement-balances">
                    <span>إجمالي المتبقي: <b>${currentBalance} ج.م</b></span>
                    <span>رصيد مستحق للزبون: <b>${currentCredit} ج.م</b></span>
                    <span>صافي الحساب: <b>${currentBalance - currentCredit} ج.م</b></span>
                </div>`;

            document.getElementById('statementTable').innerHTML = rows.length ? rows.map(r => `
                <tr>
                    <td>${formatDateWithDay(r.date, r.timestamp)}</td>
                    <td><b>${r.type}</b></td>
                    <td>${r.trays}</td>
                    <td>${r.price}</td>
                    <td>${r.total === '-' ? '-' : r.total + ' ج.م'}</td>
                    <td>${r.paid === '-' ? '-' : r.paid + ' ج.م'}</td>
                    <td><b>${r.remaining} ج.م</b>${r.credit ? `<small class="credit-inline">رصيد للزبون: ${r.credit} ج.م</small>` : ''}</td>
                    <td><b>${r.saleRemaining === '-' ? '-' : r.saleRemaining + ' ج.م'}</b></td>
                </tr>
            `).join('') : '<tr><td colspan="8" style="text-align:center;">لا توجد حركات لهذا الزبون</td></tr>';

            const summary = document.getElementById('statementSummary');
            if (summary) {
                summary.innerHTML = `
                    <span>إجمالي المبيعات: <b>${totalSales} ج.م</b></span>
                    <span>إجمالي المرتجعات: <b>${totalReturns} ج.م</b></span>
                    <span>إجمالي التحصيلات: <b>${totalPaid} ج.م</b></span>
                    <span>إجمالي المتبقي: <b>${currentBalance} ج.م</b></span>
                    <span>رصيد مستحق للزبون: <b>${currentCredit} ج.م</b></span>
                `;
            }
        }

        // =========================
        // تحديث الواجهة
        // =========================
        function updateUI() {
            // حماية نهائية: أي بيانات ناقصة من Firestore يتم استكمالها قبل عرض الواجهة
            db = normalizeDB(db);
            const stockDisplay = document.getElementById('stockDisplay');
            if (stockDisplay) stockDisplay.innerText = db.stock;

            document.getElementById('priceLargeDisplay').innerText = db.prices.large;
            document.getElementById('priceMediumDisplay').innerText = db.prices.medium;
            document.getElementById('priceSmallDisplay').innerText = db.prices.small;

            document.getElementById('setPriceLarge').value = db.prices.large;
            document.getElementById('setPriceMedium').value = db.prices.medium;
            document.getElementById('setPriceSmall').value = db.prices.small;

            document.getElementById('saleCustomerList').innerHTML =
                db.customers.map(c =>
                    `<option value="${escapeHTML(c.name)}" label="رقم ${Number(c.serial || 0)}">عليه: ${Number(c.balance || 0)} ج.م${Number(c.creditBalance || 0) ? ` — رصيد له: ${Number(c.creditBalance || 0)} ج.م` : ''}</option>`
                ).join('');

            const returnCustomerInput = document.getElementById('returnCustomerInput');
            const returnCustomerHidden = document.getElementById('returnCustomer');
            const returnCustomerList = document.getElementById('returnCustomerList');
            if (returnCustomerInput && returnCustomerHidden && returnCustomerList) {
                const currentReturnCustomerId = String(returnCustomerHidden.value || '');
                const currentCustomer = db.customers.find(c => String(c.id) === currentReturnCustomerId);
                if (currentCustomer && !returnCustomerInput.value.trim()) {
                    returnCustomerInput.value = currentCustomer.name;
                }
                updateReturnSalesOptions();
            }

            const statementSearch = document.getElementById('statementSearch');
            if (statementSearch && !statementSearch.dataset.liveBound) {
                statementSearch.addEventListener('input', searchStatementCustomer);
                statementSearch.addEventListener('focus', renderStatementSearchResults);
                statementSearch.dataset.liveBound = '1';
            }
            filterCustomers();
            renderStatementSearchResults();

            const totalCustomerDebt = db.customers.reduce((sum, c) => sum + Math.max(0, Number(c.balance || 0)), 0);
            const totalDebtEl = document.getElementById('totalCustomerDebt');
            if (totalDebtEl) totalDebtEl.innerText = totalCustomerDebt + ' ج.م';

            filterSuppliers();

            const purchaseSupplierInput = document.getElementById('purchaseSupplierInput');
            if (purchaseSupplierInput && !purchaseSupplierInput.dataset.liveBound) {
                purchaseSupplierInput.addEventListener('input', searchPurchaseSupplier);
                purchaseSupplierInput.addEventListener('focus', searchPurchaseSupplier);
                purchaseSupplierInput.dataset.liveBound = '1';
            }

            const purTrays = document.getElementById('purTrays');
            const purPrice = document.getElementById('purPrice');
            if (purTrays && !purTrays.dataset.calcBound) {
                purTrays.addEventListener('input', calcPurchase);
                purPrice?.addEventListener('input', calcPurchase);
                purTrays.dataset.calcBound = '1';
            }
            calcPurchase();

            document.getElementById('ordersTable').innerHTML =
                db.orders.map(o => `
                    <tr>
                        <td><b>${Number(o.serial || 0)}</b></td>
                        <td>${formatDateWithDay(o.date, o.timestamp)}</td>
                        <td><b>${escapeHTML(o.name)}</b></td>
                        <td>${escapeHTML(o.phone)}</td>
                        <td>${escapeHTML(o.typeName || '')} (${o.trays} طبق)</td>
                        <td>${escapeHTML(o.address)}</td>
                        <td><b>${o.total} ج.م</b></td>
                        <td>
                            <span class="badge ${o.status === 'completed' ? 'badge-completed' : 'badge-pending'}">
                                ${o.status === 'completed' ? 'تم التوصيل' : 'جديد'}
                            </span>
                        </td>
                        <td>
                            ${o.status === 'pending'
                                ? `<button data-mutation-action="1" onclick="markOrderComplete(${o.id})"
                                    style="padding:5px 10px; background:var(--success); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                                    تأكيد التوصيل
                                   </button>`
                                : '✔'}
                        </td>
                    </tr>
                `).join('');

            // نعرض فقط حركات الفترة الحالية بعد آخر تصفير يدوي.
            // المخزون الفعلي db.stock لا يتأثر بالتصفير إطلاقًا.
            const resetAt = Number(db.inventoryResetAt || 0);
            const movements = [...db.inventoryMovements]
                .filter(m => Number(m.timestamp || 0) > resetAt)
                .sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
            const totalIn = movements.filter(m => m.type === 'purchase').reduce((sum,m) => sum + Number(m.trays || 0), 0);
            const totalSold = movements.filter(m => m.type === 'sale').reduce((sum,m) => sum + Number(m.trays || 0), 0);
            const totalWasted = movements.filter(m => m.type === 'wastage').reduce((sum,m) => sum + Number(m.trays || 0), 0);
            const totalReturned = movements.filter(m => m.type === 'return').reduce((sum,m) => sum + Number(m.trays || 0), 0);
            document.getElementById('inventoryIn').innerText = totalIn + totalReturned;
            document.getElementById('inventorySold').innerText = totalSold;
            document.getElementById('inventoryWasted').innerText = totalWasted;
            const returnDisplay = document.getElementById('inventoryReturned');
            if (returnDisplay) returnDisplay.innerText = totalReturned;
            document.getElementById('inventoryRemaining').innerText = db.stock;

            document.getElementById('inventoryTable').innerHTML = movements.length ? movements.map(m => {
                const typeLabel = m.type === 'sale' ? 'بيع' : m.type === 'purchase' ? 'شراء' : m.type === 'return' ? 'مرتجع' : 'تالف / كسر';
                const typeClass = m.type === 'sale' ? 'badge-completed' : m.type === 'purchase' ? 'badge-pending' : m.type === 'return' ? 'badge-return' : '';
                const person = (m.type === 'sale' || m.type === 'return') ? escapeHTML(m.customerName || 'غير محدد') : (m.type === 'purchase' ? escapeHTML(m.supplierName || m.source || '-') : escapeHTML(m.source || '-'));
                return `<tr>
                    <td>${formatDateWithDay(m.date, m.timestamp)}</td>
                    <td><span class="badge ${typeClass}">${typeLabel}</span></td>
                    <td><b>${m.trays}</b> طبق</td>
                    <td>${person}</td>
                    <td>${m.price ? m.price + ' ج.م' : '-'}</td>
                    <td>${m.total ? m.total + ' ج.م' : '-'}</td>
                    <td>${escapeHTML(m.reason || '-')}</td>
                </tr>`;
            }).join('') : '<tr><td colspan="7" style="text-align:center; color:#64748b;">لا توجد حركات مخزن حتى الآن</td></tr>';

            calcOnlineOrder();
            calcSale();
        }

        // كشف الحساب يتم عبر البحث بالاسم من خلال searchStatementCustomer().


        // تصفير حركة المخزن للفترة الحالية فقط.
        // لا يغيّر المخزون الحالي ولا يحذف البيانات من Firebase؛ فقط يبدأ فترة جديدة للعرض والحسابات.
        async function resetInventoryStats() {
            if (!databaseReady) {
                alert('انتظر حتى يتم تحميل قاعدة البيانات أولًا.');
                return;
            }

            const currentStock = Number(db.stock || 0);
            const confirmed = confirm(
                `سيتم تصفير إجمالي الداخل والمبيعات والتالف والمرتجعات وحركات الفترة الحالية.\n\n` +
                `المتبقي في المخزن (${currentStock} طبق) لن يتغير.\n\n` +
                `بعد التصفير، أي شراء جديد أو بيع جديد سيبدأ في حساب فترة جديدة.\n\nهل تريد المتابعة؟`
            );
            if (!confirmed) return;

            const mutationSnapshot = beginMutation();
            if (!mutationSnapshot) return;

            db.inventoryResetAt = Date.now();
            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot);
            if (saved) {
                updateUI();
                alert(`تم تصفير حركة المخزن بنجاح.\nالمتبقي الحالي: ${currentStock} طبق`);
            }
        }

        function renderInventory() {
            updateUI();
        }

        // =========================
        // تشغيل التطبيق
        // =========================
        // لأننا نستخدم <script type="module">، الدوال لا تكون global تلقائيًا.
        // هذه الأسطر تجعل أزرار HTML الحالية قادرة على استدعائها.
        Object.assign(window, {
            promptAdminLogin,
            toggleAdminMode,
            toggleSidebar,
            switchTab,
            calcOnlineOrder,
            submitOnlineOrder,
            updatePrices,
            markOrderComplete,
            calcSale,
            addSale,
            addCustomer,
            addSupplier,
            filterSuppliers,
            searchPurchaseSupplier,
            selectPurchaseSupplier,
            calcPurchase,
            addPurchase,
            addWastage,
            payDebt,
            addReturn,
            updateReturnSalesOptions,
            handleReturnCustomerInput,
            renderReturnCustomerResults,
            selectReturnCustomer,
            updateReturnPreview,
            renderStatement,
            searchStatementCustomer,
            selectStatementCustomer,
            filterCustomers,
            renderInventory,
            resetInventoryStats
        });

        // =============================================
        // ربط الدوال المستخدمة داخل HTML بالـ window
        // لأن هذا الملف يعمل باستخدام type="module".
        // =============================================
        Object.assign(window, {
            promptAdminLogin,
            toggleAdminMode,
            toggleSidebar,
            switchTab,
            calcOnlineOrder,
            submitOnlineOrder,
            updatePrices,
            markOrderComplete,
            calcSale,
            addSale,
            addCustomer,
            addSupplier,
            filterSuppliers,
            searchPurchaseSupplier,
            selectPurchaseSupplier,
            calcPurchase,
            addPurchase,
            addWastage,
            payDebt,
            addReturn,
            updateReturnSalesOptions,
            handleReturnCustomerInput,
            renderReturnCustomerResults,
            selectReturnCustomer,
            updateReturnPreview,
            renderStatement,
            selectStatementCustomer,
            searchStatementCustomer,
            renderInventory,
            resetInventoryStats
        });

        // بدء تحميل البيانات من Firebase مرة واحدة
        console.log("EGG STORE FIREBASE FINAL V2 - index loaded");
        loadDB();
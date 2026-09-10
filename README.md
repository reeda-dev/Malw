# Egg Store Secure V2

## الروابط
- الزبون: `/`
- الإدارة: `/admin/`
- تسجيل الدخول: `/admin/login.html`

## إعداد Firebase المطلوب (مهم جدًا)

### 1. تفعيل طرق تسجيل الدخول
1. ادخل Firebase Console → مشروعك
2. Authentication → Sign-in method
3. فعّل **Email/Password**
4. فعّل **Anonymous** (ضروري للزبون)

### 2. إنشاء حساب الأدمن
- Authentication → Users → Add user
- أنشئ حساب بالإيميل والباسورد اللي هتستخدمهم في لوحة الإدارة

### 3. تحديث ونشر Firestore Rules
1. افتح ملف `firestore.rules`
2. استبدل `PUT_ADMIN_EMAIL_HERE` بإيميل الأدمن الحقيقي
3. انسخ المحتوى كله
4. روح Firebase Console → Firestore Database → Rules
5. الصق القواعد واضغط Publish

### 4. نشر الأسعار العامة
- افتح لوحة الإدارة وسجّل الدخول
- حدّث الأسعار مرة واحدة
- ده هيعمل نشر تلقائي في `store_public/config` عشان الزبون يشوفها

## رسائل الخطأ الشائعة

| الخطأ | السبب | الحل |
|-------|-------|------|
| `auth/admin-restricted-operation` | Anonymous مش مفعّل | فعّل Anonymous من Authentication |
| `public_config_missing` | الأسعار العامة مش موجودة | سجّل دخول الأدمن وحدّث الأسعار |
| `permission-denied` | مشكلة في الـ Rules | تأكد إنك نشرت الـ Rules وعدّلت إيميل الأدمن |

## ملاحظة أمنية
Firebase Web API key الظاهرة في ملفات الواجهة **ليست** كلمة سر. الحماية الفعلية تعتمد على Authentication و Firestore Security Rules. لا تضع أي Service Account keys أو secrets داخل الواجهة.

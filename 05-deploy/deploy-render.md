# رفع اللمّة على Render (مجاني تماماً)

اللعبة كلها خدمة واحدة: السيرفر بيقدّم الواجهة والـ WebSocket مع بعض. ومش محتاج كارت.

## ١. ارفع الكود على GitHub
من جوه فولدر `Allamma`:
```bash
git init
git add .
git commit -m "Allamma v0.1"
```
اعمل ريبو جديد على حسابك الشخصي `AbdelrahmanTarek-01`، سمّيه `allamma`، وبعدين:
```bash
git remote add origin https://github.com/AbdelrahmanTarek-01/allamma.git
git branch -M main
git push -u origin main
```

## ٢. اعمل الخدمة على Render
1. ادخل render.com، واعمل حساب بـ GitHub.
2. **New → Web Service**، واختار ريبو `allamma`.
3. املا كده:

| الخانة | القيمة |
|---|---|
| Name | `allamma` (ده هيبقى اللينك: allamma.onrender.com) |
| Root Directory | `03-code` |
| Runtime | Node |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Instance Type | **Free** |
| Health Check Path | `/api/health` |
| Environment Variable | `NODE_VERSION` = `22` |

4. دوس **Create Web Service**، واستنى البناء (حوالي ٣ دقايق).
5. افتح `https://allamma.onrender.com`، وابعت اللينك لصحابك.

بعد كده أي `git push` على main بيعمل نشر جديد لوحده.

> لو اسم `allamma` مش متاح، Render هيدّيك اسم قريب. اللينك هيبان فوق في صفحة الخدمة.

## ٣. خلّي السيرفر صاحي على طول (اختياري، ببلاش)
الخطة المجانية بتنيّم السيرفر بعد ١٥ دقيقة من غير استخدام، وأول فتحة بعدها بتاخد حوالي دقيقة. عشان تلغي الانتظار ده:
1. ادخل **cron-job.org** واعمل حساب مجاني.
2. **Create cronjob**:
   - URL: `https://allamma.onrender.com/api/health`
   - Schedule: كل **10 دقايق**
3. احفظ.

الحساب: الشهر حوالي ٧٤٤ ساعة، والحد المجاني ٧٥٠ ساعة. يعني يكفي **خدمة واحدة بس** شغالة طول الشهر. لو عملت خدمة مجانية تانية على نفس الحساب، الساعات هتخلص قبل آخر الشهر.

> حتى من غير الخطوة دي، الواجهة بتبعت للسيرفر يصحى أول ما الصفحة تفتح، واللاعب بيشوف سكيلتون "بنصحّي السيرفر… ثواني" لحد ما يصحى.

## حاجات لازم تعرفها عن المجاني
- **الأوض متخزنة في الذاكرة.** لو Render عمل ريستارت للسيرفر (بيحصل نادراً، أو مع كل نشر جديد)، الأوض اللي شغالة بتروح، والناس يعملوا أوضة جديدة. عشان كده ما تنشرش وصحابك بيلعبوا.
- **مفيش داتابيز دلوقتي**، ومش محتاجين واحدة: مفيش حسابات ولا تاريخ.
- لو اللعبة كبرت وبقت محتاجة سيرفر صاحي على طول وأقوى، الخطوة الجاية Oracle Cloud Always Free بالـ `Dockerfile` و`docker-compose.yml` اللي في الفولدر ده.

## التأكد إن كله تمام
- `https://allamma.onrender.com/api/health` لازم يرجّع `{"ok":true,...}`.
- افتح اللعبة من ٣ موبايلات (أو من شبابيك متصفح خفية)، واعمل أوضة، وادخل بالكود، والعب جولة.

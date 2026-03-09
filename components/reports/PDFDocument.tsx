import jsPDF from 'jspdf';
import { resolveImageUrl } from '@/lib/utils/image';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface ReportSegment {
    procedureId: string;
    procedureType: string;
    title: string;
    formData: any;
    selectedImages: (string | { url: string; caption?: string; scopeShape?: string | null })[];
    imageCaptions: Record<string, string>;
    captures: any[];
    equipment?: { name: string; type: string; serialNumber?: string }[];
    prescriptions?: {
        name: string;
        generic: string;
        dosage: string;
        frequency: string;
        duration: string;
        instruction: string;
    }[];
}

export interface ReportData {
    patient: any;
    doctor: any;
    hospital: any;
    segments: ReportSegment[];
    action?: 'download' | 'preview' | 'print' | 'share';
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE GEOMETRY  — ultra-thin margins to maximise content area
// ─────────────────────────────────────────────────────────────────────────────
const IMG_QUALITY = 1.0;
const COMPRESSION = 'SLOW' as const;

const PW = 210;          // A4 width  mm
const PH = 297;          // A4 height mm
const ML = 5;            // left  margin — as thin as possible
const MR = 5;            // right margin
const MT = 4;            // top   margin
const MB = 3;            // bottom margin
const CW = PW - ML - MR; // 200 mm usable width

// Body columns  left 56 % | 2 mm gap | right 44 %
const COL_GAP = 2;
const LEFT_W = Math.floor(CW * 0.56);   // ~112 mm
const RIGHT_W = CW - LEFT_W - COL_GAP;   // ~86 mm
const RIGHT_X = ML + LEFT_W + COL_GAP;

// ─────────────────────────────────────────────────────────────────────────────
// COLOURS
// ─────────────────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C: Record<string, RGB> = {
    black: [20, 20, 22],
    dark: [35, 35, 40],
    mid: [80, 80, 92],
    label: [108, 108, 122],
    muted: [158, 158, 168],
    line: [210, 212, 222],
    navy: [18, 42, 108],
    blue: [30, 80, 200],
    blueBg: [28, 65, 165],
    white: [255, 255, 255],
    errBg: [254, 226, 226],
    errFg: [185, 28, 28],
};

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE LOADERS
// ─────────────────────────────────────────────────────────────────────────────
interface LoadedImg { base64: string; w: number; h: number; error?: string; }

const fetchToDataUrl = async (url: string): Promise<string> => {
    if (url.startsWith('data:')) return url;
    const abs = url.startsWith('/') ? window.location.origin + url : url;
    const r = await fetch(abs, { cache: 'no-store', credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    return new Promise<string>((res) => {
        const fr = new FileReader();
        fr.onloadend = () => res(fr.result as string);
        fr.readAsDataURL(blob);
    });
};

/**
 * Shape-aware image loader for PDF generation.
 *
 * circle      → PNG with circular alpha mask, transparent outside ring
 * square      → JPEG, square crop (cover-fit), no mask
 * rectangle   → JPEG, preserves natural aspect ratio
 * null/undef  → treated as 'circle' for backward compat
 */
const loadShapedImage = (url: string, scopeShape?: string | null): Promise<LoadedImg> =>
    new Promise(async (resolve) => {
        if (!url) { resolve({ base64: '', w: 0, h: 0, error: 'no-url' }); return; }

        const shape = scopeShape || 'circle';

        try {
            const dataUrl = await fetchToDataUrl(url);
            const img = new Image();
            img.onload = () => {
                const sw = img.naturalWidth || img.width || 100;
                const sh = img.naturalHeight || img.height || 100;

                // Target ~300 DPI for 86mm column width
                const PRINT_TARGET = 1016;
                const PRINT_CAP = 1600;
                const nativeLong = Math.max(sw, sh);
                const sc = Math.min(Math.max(nativeLong, PRINT_TARGET), PRINT_CAP) / nativeLong;

                if (shape === 'circle') {
                    // ── Circle: square canvas, circular clip, PNG with alpha ──
                    const side = Math.round(Math.max(sw, sh) * sc);
                    const cv = document.createElement('canvas');
                    cv.width = side;
                    cv.height = side;
                    const ctx = cv.getContext('2d', { willReadFrequently: true })!;

                    // CRITICAL: do NOT fill background — keep fully transparent
                    ctx.clearRect(0, 0, side, side);

                    // Clip to circle
                    ctx.beginPath();
                    ctx.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();

                    // Draw image cover-fit centred in the square
                    const srcAsp = sw / sh;
                    let dx = 0, dy = 0, dw = side, dh = side;
                    if (srcAsp > 1) { dh = side / srcAsp; dy = (side - dh) / 2; }
                    else { dw = side * srcAsp; dx = (side - dw) / 2; }

                    ctx.imageSmoothingEnabled = true;
                    (ctx as any).imageSmoothingQuality = 'high';
                    ctx.drawImage(img, dx, dy, dw, dh);

                    resolve({ base64: cv.toDataURL('image/png'), w: side, h: side });

                } else if (shape === 'square') {
                    // ── Square: square canvas, cover-fit, white bg, JPEG ──
                    const side = Math.round(Math.max(sw, sh) * sc);
                    const cv = document.createElement('canvas');
                    cv.width = side;
                    cv.height = side;
                    const ctx = cv.getContext('2d')!;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, side, side);

                    // Cover-fit: crop to fill the square
                    const srcAsp = sw / sh;
                    let sx = 0, sy = 0, sWidth = sw, sHeight = sh;
                    if (srcAsp > 1) { sWidth = sh; sx = (sw - sWidth) / 2; }
                    else { sHeight = sw; sy = (sh - sHeight) / 2; }

                    ctx.imageSmoothingEnabled = true;
                    (ctx as any).imageSmoothingQuality = 'high';
                    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, side, side);

                    resolve({ base64: cv.toDataURL('image/jpeg', 0.95), w: side, h: side });

                } else {
                    // ── Rectangle: preserve natural aspect ratio, white bg, JPEG ──
                    const outW = Math.round(sw * sc);
                    const outH = Math.round(sh * sc);
                    const cv = document.createElement('canvas');
                    cv.width = outW;
                    cv.height = outH;
                    const ctx = cv.getContext('2d')!;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, outW, outH);
                    ctx.imageSmoothingEnabled = true;
                    (ctx as any).imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, outW, outH);

                    resolve({ base64: cv.toDataURL('image/jpeg', 0.95), w: outW, h: outH });
                }
            };
            img.onerror = () => resolve({ base64: '', w: 0, h: 0, error: 'load-fail' });
            img.src = dataUrl;
        } catch (e: any) {
            resolve({ base64: '', w: 0, h: 0, error: e?.message });
        }
    });

/** Plain raster image (no mask) — for logo / signature */
const loadPlainImage = (url: string): Promise<LoadedImg> =>
    new Promise(async (resolve) => {
        if (!url) { resolve({ base64: '', w: 0, h: 0, error: 'no-url' }); return; }
        try {
            const dataUrl = await fetchToDataUrl(url);
            const img = new Image();
            img.onload = () => {
                const ow = img.naturalWidth || img.width || 1;
                const oh = img.naturalHeight || img.height || 1;
                const MAX = 2400;
                let cw = ow, ch = oh;
                if (ow > MAX || oh > MAX) {
                    if (ow > oh) { cw = MAX; ch = Math.round(MAX * oh / ow); }
                    else { ch = MAX; cw = Math.round(MAX * ow / oh); }
                }
                const cv = document.createElement('canvas');
                cv.width = cw; cv.height = ch;
                const ctx = cv.getContext('2d')!;
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, cw, ch);
                ctx.drawImage(img, 0, 0, cw, ch);
                resolve({ base64: cv.toDataURL('image/jpeg', IMG_QUALITY), w: ow, h: oh });
            };
            img.onerror = () => resolve({ base64: '', w: 0, h: 0, error: 'load-fail' });
            img.src = dataUrl;
        } catch (e: any) { resolve({ base64: '', w: 0, h: 0, error: e?.message }); }
    });

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export const generatePDF = async (data: ReportData): Promise<Blob> => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    (doc as any).internal.write('/ColorSpace /DeviceRGB');
    const { patient, doctor, hospital, segments } = data;

    const rawName = (doctor?.fullName || doctor?.name || 'Doctor').trim();
    const nameClean = rawName.replace(/^dr\.?\s*/i, '').trim() || rawName;
    const drDisplay = /^dr\.?\s/i.test(rawName) ? rawName : `Dr. ${nameClean}`;
    const drDegree = doctor?.degree ? `, ${doctor.degree}` : '';
    const drFullLine = `${drDisplay}${drDegree}`;
    const drRole = doctor?.role || 'Consultant Specialist';

    const setT = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const setF = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
    const setD = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
    const lw = (w: number) => doc.setLineWidth(w);

    const FOOTER_H = 16;
    const footerTop = PH - MB - FOOTER_H;

    const drawFooter = async () => {
        const rx = PW - MR;
        const SIG_BOTTOM = PH - MB;
        const sigPath = doctor?.signaturePath || doctor?.sign;
        if (sigPath) {
            try {
                const su = resolveImageUrl(sigPath);
                if (su) {
                    const sd = await loadPlainImage(su);
                    if (sd.base64 && !sd.error) {
                        const maxH = 10, maxW = 44;
                        const asp = (sd.w || 1) / (sd.h || 1);
                        let sw2 = maxH * asp, sh2 = maxH;
                        if (sw2 > maxW) { sw2 = maxW; sh2 = sw2 / asp; }
                        const sigY = SIG_BOTTOM - sh2 - 5;
                        doc.addImage(sd.base64, 'PNG', rx - sw2, sigY, sw2, sh2, undefined, COMPRESSION);
                    }
                }
            } catch (_) { }
        }
        setT(C.dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(drFullLine, rx, SIG_BOTTOM - 4.5, { align: 'right' });
        setT(C.label); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.text(drRole, rx, SIG_BOTTOM - 0.5, { align: 'right' });
    };

    const drawHeader = async (seg: ReportSegment): Promise<number> => {
        let y = MT;
        const rx = PW - MR;

        const R1H = 12;
        const ZC_W = 64;
        const ZC_X = rx - ZC_W;

        let logoEndX = ML + 14;
        if (hospital?.logoPath) {
            try {
                const lu = resolveImageUrl(hospital.logoPath);
                if (lu) {
                    const ld = await loadPlainImage(lu);
                    if (ld.base64 && !ld.error) {
                        const maxH = 10, maxW = 46;
                        const asp = (ld.w || 1) / (ld.h || 1);
                        let lh2 = maxH, lw2 = lh2 * asp;
                        if (lw2 > maxW) { lw2 = maxW; lh2 = lw2 / asp; }
                        const logoY = y + (R1H - lh2) / 2;
                        doc.addImage(ld.base64, 'JPEG', ML, logoY, lw2, lh2, undefined, COMPRESSION);
                        logoEndX = ML + lw2 + 2;
                    }
                }
            } catch (_) { }
        } else {
            setF(C.navy);
            doc.circle(ML + 6, y + R1H / 2, 5.5, 'F');
            setT(C.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
            doc.text((hospital?.name || 'H').charAt(0).toUpperCase(), ML + 6, y + R1H / 2 + 3, { align: 'center' });
            logoEndX = ML + 15;
        }

        const ZB_X = logoEndX;
        const ZB_W = ZC_X - ZB_X - 3;

        setT(C.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.text((hospital?.name || 'HOSPITAL').toUpperCase(), ZB_X, y + 5);

        const contactParts = [
            hospital?.address,
            hospital?.mobile || hospital?.phone,
            hospital?.contactEmail || hospital?.email,
        ].filter(Boolean);
        const contactStr = contactParts.join('  |  ');
        if (contactStr) {
            setT(C.mid); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
            const contactLines = doc.splitTextToSize(contactStr, ZB_W);
            doc.text(contactLines[0] || '', ZB_X, y + 9.5);
            if (contactLines[1]) doc.text(contactLines[1], ZB_X, y + 12.5);
        }

        const repDate = new Date();
        const dateStr = repDate
            .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase()
            + '  '
            + repDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        setT(C.label); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.text('Consultant Name:', ZC_X, y + 3.5);
        doc.text('Report Date:', ZC_X, y + 10);

        setT(C.dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        doc.text(drFullLine, rx, y + 3.5, { align: 'right' });

        setT(C.label); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.text(drRole, rx, y + 7, { align: 'right' });

        setT(C.dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        doc.text(dateStr, rx, y + 11, { align: 'right' });

        y += R1H;

        setD(C.navy); lw(0.5);
        doc.line(ML, y, rx, y);
        y += 1.5;

        const R2H = 10;
        const DEMO_W = Math.floor(CW * 0.56);
        const PILL_X = ML + DEMO_W + 2;
        const PILL_W = rx - PILL_X;
        const PILL_H = 7;
        const PILL_Y = y + (R2H - PILL_H) / 2;

        const demoCols = [
            { label: 'MRN No', value: patient?.mrn || 'N/A' },
            { label: 'Name', value: (patient?.fullName || patient?.name || 'N/A').toUpperCase() },
            { label: 'Age/Sex', value: `${patient?.age || '--'} Yrs / ${patient?.gender || '--'}` },
            { label: 'Ref', value: (patient?.referringDoctor || 'N/A').toUpperCase() },
        ];
        const demoColW = DEMO_W / demoCols.length;
        demoCols.forEach((col, i) => {
            const cx = ML + i * demoColW;
            setT(C.label); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
            doc.text(col.label, cx, y + 3);
            setT(C.dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
            const truncated = doc.splitTextToSize(col.value, demoColW - 1)[0] || col.value;
            doc.text(truncated, cx, y + 8);
        });

        setF(C.blueBg);
        doc.roundedRect(PILL_X, PILL_Y, PILL_W, PILL_H, 1.5, 1.5, 'F');
        setT(C.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
        const titleRaw = (seg.title || 'DIAGNOSTIC ENDOSCOPY REPORT').toUpperCase();
        const titleLines = doc.splitTextToSize(titleRaw, PILL_W - 5);
        const tLineH = 3.8;
        const tTotalH = Math.min(titleLines.length, 2) * tLineH;
        const tStartY = PILL_Y + (PILL_H - tTotalH) / 2 + tLineH - 0.8;
        titleLines.slice(0, 2).forEach((line: string, li: number) => {
            doc.text(line, PILL_X + PILL_W / 2, tStartY + li * tLineH, { align: 'center' });
        });

        y += R2H + 5;
        return y;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SEGMENT LOOP
    // ─────────────────────────────────────────────────────────────────────────
    for (let si = 0; si < segments.length; si++) {
        if (si > 0) doc.addPage();
        const seg = segments[si];

        // ── Pre-load images with shape awareness ──
        const imgs: { base64: string; caption: string; scopeShape: string; error?: string }[] = [];
        for (const inp of seg.selectedImages) {
            let url = '', caption = '', scopeShape = 'circle';
            if (typeof inp === 'string') {
                const cap = seg.captures?.find((x: any) => x.id === inp);
                if (cap) {
                    url = cap.url || '';
                    caption = seg.imageCaptions?.[inp] || '';
                    scopeShape = cap.scopeShape || 'circle';
                }
            } else {
                url = inp.url || '';
                caption = inp.caption || '';
                scopeShape = (inp as any).scopeShape || 'circle';
            }
            const resolved = url ? (resolveImageUrl(url) || '') : '';
            const ld = await loadShapedImage(resolved, scopeShape);
            imgs.push({ base64: ld.base64, caption, scopeShape, error: ld.error });
        }

        const bodyY = await drawHeader(seg);

        const LEFT_BOTTOM = PH - MB;
        const RIGHT_BOTTOM = footerTop - 1;
        const LEFT_BODY_H = LEFT_BOTTOM - bodyY;
        const RIGHT_BODY_H = RIGHT_BOTTOM - bodyY;
        const BODY_H = LEFT_BODY_H;

        // ═════════════════════════════════════════════════════════════════════
        // RIGHT COLUMN — shape-aware image rendering
        //
        // circle    → square slot, PDF circle border drawn on top (image is already masked)
        // square    → square slot, rounded-rect border
        // rectangle → full column width, aspect-ratio height, plain rect border
        // ═════════════════════════════════════════════════════════════════════
        const maxImgs = Math.min(imgs.length, 6);
        const CAP_H = 5.0;
        const IMG_GAP = 2.0;

        if (maxImgs > 0) {
            // Calculate slot size: fill available height equally for circle/square images.
            // Rectangle images will be shorter (use 16:9 ratio within slot).
            const totalGaps = (maxImgs - 1) * IMG_GAP;
            const totalCaps = maxImgs * CAP_H;
            const availH = RIGHT_BODY_H - totalGaps - totalCaps;
            // Base slot size — square fits in RIGHT_W and divided height
            const slotSize = Math.min(RIGHT_W, Math.max(10, availH / maxImgs));
            const xCenter = RIGHT_X + RIGHT_W / 2;

            let imgY = bodyY;
            for (let i = 0; i < maxImgs; i++) {
                const img = imgs[i];
                const shape = img.scopeShape || 'circle';

                // Rendered width / height for this specific shape
                let renderW: number, renderH: number;
                if (shape === 'rectangle') {
                    renderW = RIGHT_W;
                    renderH = Math.round(RIGHT_W * 9 / 16); // 16:9
                    renderH = Math.min(renderH, slotSize);  // don't exceed slot height
                } else {
                    // circle and square are always square slots
                    renderW = slotSize;
                    renderH = slotSize;
                }

                const xStart = RIGHT_X + (RIGHT_W - renderW) / 2;
                const cy = imgY + renderH / 2; // vertical centre of image

                if (!img.base64 || img.error) {
                    // Error placeholder — shape-matched outline
                    setF(C.errBg);
                    if (shape === 'circle') {
                        doc.circle(xCenter, cy, renderW / 2, 'F');
                        setD(C.errFg); lw(0.3); doc.circle(xCenter, cy, renderW / 2, 'S');
                    } else {
                        const r = shape === 'square' ? 2 : 1;
                        doc.roundedRect(xStart, imgY, renderW, renderH, r, r, 'F');
                        setD(C.errFg); lw(0.3); doc.roundedRect(xStart, imgY, renderW, renderH, r, r, 'S');
                    }
                    setT(C.errFg); doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5);
                    doc.text('No Image', xCenter, cy + 2, { align: 'center' });
                } else {
                    // Image is already shape-processed by loadShapedImage canvas.
                    // For circle: base64 is PNG with alpha — jsPDF respects alpha channel.
                    // For square/rect: base64 is JPEG.
                    const imgFmt = shape === 'circle' ? 'PNG' : 'JPEG';
                    doc.addImage(
                        img.base64, imgFmt,
                        xStart, imgY, renderW, renderH,
                        `img_${si}_${i}`, 'FAST'
                    );

                    // Draw shape border on top of image
                    if (shape === 'circle') {
                        setD(C.line); lw(0.3);
                        doc.circle(xCenter, cy, renderW / 2, 'S');
                    } else if (shape === 'square') {
                        setD(C.line); lw(0.3);
                        doc.roundedRect(xStart, imgY, renderW, renderH, 2, 2, 'S');
                    } else {
                        setD(C.line); lw(0.25);
                        doc.rect(xStart, imgY, renderW, renderH, 'S');
                    }
                }

                // Index badge — top-left corner of image
                const bx = xStart + 0.8, by = imgY + 0.8;
                setF(C.navy); doc.roundedRect(bx, by, 5.5, 3.8, 1, 1, 'F');
                setT(C.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
                doc.text(`${i + 1}`, bx + 2.75, by + 3, { align: 'center' });

                // Caption — centred below image
                const capTxt = img.caption ? `Fig ${i + 1}: ${img.caption}` : `Fig ${i + 1}`;
                setT(C.muted); doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5);
                doc.text(
                    doc.splitTextToSize(capTxt, RIGHT_W - 2)[0] || capTxt,
                    xCenter, imgY + renderH + 4,
                    { align: 'center' }
                );

                imgY += renderH + CAP_H + (i < maxImgs - 1 ? IMG_GAP : 0);
            }
        }

        // ═════════════════════════════════════════════════════════════════════
        // LEFT COLUMN — form sections + prescriptions (unchanged)
        // ═════════════════════════════════════════════════════════════════════
        const sections = (seg.formData?.printableSections || []) as any[];
        const rxList = seg.prescriptions || [];

        const LABEL_X = ML;
        const LEFT_EDGE = ML;
        const LEFT_EDGE_R = ML + LEFT_W;
        const LBL_W = 36;
        const VAL_X = LEFT_EDGE + LBL_W;
        const VAL_W = LEFT_EDGE_R - VAL_X - 1;
        const BI_HALF_W = (VAL_W / 2) - 6;
        const BI_R_X = VAL_X;
        const BI_L_X = VAL_X + VAL_W / 2 + 1;

        let fsSec = 8.0, fsLbl = 7.0, fsVal = 8.5, lh = 4.0;
        const SEC_GAP = 2.0;
        const HEAD_H = () => fsSec * 0.35 + 2.8;

        const measureAll = (): number => {
            let h = 0;
            for (const sec of sections) {
                const hasData = sec.items?.some((it: any) => it.value && String(it.value).trim() && it.value !== 'undefined');
                if (!hasData) continue;
                h += HEAD_H();
                for (const item of sec.items) {
                    const val = String(item.value || '').trim();
                    if (!val || val === 'undefined') continue;
                    doc.setFontSize(fsVal);
                    if (item.type === 'bilateral' && item.rawValue) {
                        const rl = doc.splitTextToSize(String(item.rawValue.right || '—'), BI_HALF_W).length;
                        const ll = doc.splitTextToSize(String(item.rawValue.left || '—'), BI_HALF_W).length;
                        h += Math.max(rl, ll) * lh + 0.4;
                    } else {
                        h += doc.splitTextToSize(val, VAL_W).length * lh + 0.4;
                    }
                }
                h += SEC_GAP;
            }
            if (rxList.length > 0) {
                h += HEAD_H();
                h += rxList.length * (lh + 0.4);
            }
            return h;
        };

        for (let iter = 0; iter < 15; iter++) {
            if (measureAll() <= LEFT_BODY_H) break;
            const ratio = (LEFT_BODY_H / measureAll()) * 0.97;
            fsSec = Math.max(5.5, fsSec * ratio);
            fsLbl = Math.max(5.0, fsLbl * ratio);
            fsVal = Math.max(6.0, fsVal * ratio);
            lh = Math.max(3.0, lh * ratio);
        }

        let tY = bodyY;

        for (const sec of sections) {
            const hasData = sec.items?.some((it: any) => it.value && String(it.value).trim() && it.value !== 'undefined');
            if (!hasData) continue;

            setT(C.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(fsSec);
            const secTitle = sec.title.toUpperCase();
            doc.text(secTitle, LABEL_X, tY);
            const tw = doc.getStringUnitWidth(secTitle) * fsSec / doc.internal.scaleFactor;
            setD(C.blue); lw(0.2);
            doc.line(LABEL_X, tY + 0.9, LABEL_X + Math.min(tw, LEFT_W), tY + 0.9);
            tY += HEAD_H();

            for (const item of sec.items) {
                const val = String(item.value || '').trim();
                if (!val || val === 'undefined') continue;

                setT(C.label); doc.setFont('helvetica', 'bold'); doc.setFontSize(fsLbl);
                const lblTxt = doc.splitTextToSize(`${item.label}:`, LBL_W - 1)[0] || `${item.label}:`;
                doc.text(lblTxt, LABEL_X + 1, tY);

                if (item.type === 'bilateral' && item.rawValue) {
                    setT(C.blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(fsLbl);
                    doc.text('R:', BI_R_X, tY);
                    setT(C.dark); doc.setFont('times', 'normal'); doc.setFontSize(fsVal);
                    const rLines = doc.splitTextToSize(String(item.rawValue.right || '—'), BI_HALF_W);
                    doc.text(rLines, BI_R_X + 5, tY);

                    setT(C.blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(fsLbl);
                    doc.text('L:', BI_L_X, tY);
                    setT(C.dark); doc.setFont('times', 'normal'); doc.setFontSize(fsVal);
                    const lLines = doc.splitTextToSize(String(item.rawValue.left || '—'), BI_HALF_W);
                    doc.text(lLines, BI_L_X + 5, tY);

                    tY += Math.max(rLines.length, lLines.length) * lh + 0.4;
                } else {
                    setT(C.dark); doc.setFont('times', 'normal'); doc.setFontSize(fsVal);
                    const lines = doc.splitTextToSize(val, VAL_W);
                    doc.text(lines, VAL_X, tY);
                    tY += lines.length * lh + 0.4;
                }
            }
            tY += SEC_GAP;
        }

        if (rxList.length > 0) {
            setT(C.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(fsSec);
            doc.text('PRESCRIPTION / Rx', LABEL_X, tY);
            const ptw = doc.getStringUnitWidth('PRESCRIPTION / Rx') * fsSec / doc.internal.scaleFactor;
            setD(C.blue); lw(0.2);
            doc.line(LABEL_X, tY + 0.9, LABEL_X + Math.min(ptw, LEFT_W), tY + 0.9);
            tY += HEAD_H();

            for (const rx of rxList) {
                const fsRxVal = Math.max(fsVal - 0.5, 6.0);
                const fsRxSml = Math.max(fsLbl - 0.5, 5.0);
                const RX_LINE_NAME_W = 30, RX_LINE_GEN_W = 22;
                const RX_LINE_DTL_X = LEFT_EDGE + RX_LINE_NAME_W + RX_LINE_GEN_W + 2;
                const RX_LINE_INS_W = 26;
                const RX_LINE_INS_X = LEFT_EDGE_R - RX_LINE_INS_W;
                const RX_LINE_DTL_W = RX_LINE_INS_X - RX_LINE_DTL_X - 2;

                setT(C.dark); doc.setFont('times', 'bold'); doc.setFontSize(fsRxVal);
                doc.text(doc.splitTextToSize(rx.name || 'Medicine', RX_LINE_NAME_W)[0] || '', LEFT_EDGE, tY);

                if (rx.generic) {
                    setT(C.muted); doc.setFont('times', 'italic'); doc.setFontSize(fsRxSml);
                    doc.text(doc.splitTextToSize(`(${rx.generic})`, RX_LINE_GEN_W)[0] || '', LEFT_EDGE + RX_LINE_NAME_W + 1, tY);
                }

                const details = [rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(' · ');
                if (details && RX_LINE_DTL_W > 4) {
                    setT(C.mid); doc.setFont('times', 'normal'); doc.setFontSize(fsRxSml);
                    doc.text(doc.splitTextToSize(details, RX_LINE_DTL_W)[0] || '', RX_LINE_DTL_X, tY);
                }

                if (rx.instruction) {
                    setT(C.label); doc.setFont('times', 'italic'); doc.setFontSize(fsRxSml);
                    doc.text(doc.splitTextToSize(rx.instruction, RX_LINE_INS_W)[0] || '', RX_LINE_INS_X, tY);
                }

                tY += lh + 0.4;
            }
        }

        await drawFooter();
    }

    if (data.action === 'download') {
        const safe = (patient?.fullName || patient?.name || 'Report').replace(/[^a-z0-9_\- ]/gi, '_');
        doc.save(`${safe}_Report.pdf`);
    }
    return doc.output('blob');
};
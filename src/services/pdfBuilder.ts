import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import dayjs from 'dayjs';
import { bitable, IAttachmentField } from '@lark-base-open/js-sdk';
import { containsChinese, loadChineseFont } from '../utils/fontUtils';
import { LoadedGroup } from '../types';

interface BuildPdfParams {
  groups: LoadedGroup[];
  hasLoaded: boolean;
  testName: string;
  testSampleType: string;
  testSampleName: string;
  setStatus: (msg: string) => void;
  setError: (msg: string) => void;
  setLoading?: (loading: boolean) => void;
  // 上传附件相关参数
  recordId?: string;
  tableId?: string;
  attachmentFieldId?: string;
}

export async function buildPdf({
  groups,
  hasLoaded,
  testName,
  testSampleType,
  testSampleName,
  setStatus,
  setError,
  setLoading,
  recordId,
  tableId,
  attachmentFieldId
}: BuildPdfParams) {
  console.log('[PDF] ===== 开始生成 PDF =====');
  console.log('[PDF] hasLoaded:', hasLoaded);
  console.log('[PDF] groups:', groups);
  console.log('[PDF] testName:', testName);
  console.log('[PDF] testSampleType:', testSampleType);
  console.log('[PDF] testSampleName:', testSampleName);

  if (!hasLoaded) {
    console.warn('[PDF] 数据未加载，终止生成');
    setError('请先读取记录数据');
    return;
  }
  setError('');
  setStatus('正在生成 PDF...');
  setLoading?.(true);

  try {
    console.log('[PDF] Step 1: 创建 PDFDocument...');
    const pdfDoc = await PDFDocument.create();
    console.log('[PDF] Step 1: PDFDocument 创建成功');

    console.log('[PDF] Step 2: 注册 fontkit...');
    pdfDoc.registerFontkit(fontkit);
    console.log('[PDF] Step 2: fontkit 注册成功');

    console.log('[PDF] Step 3: 加载中文字体...');
    setStatus('正在加载中文字体...');
    const chineseFontBytes = await loadChineseFont();
    console.log('[PDF] Step 3: 字体加载结果:', chineseFontBytes ? `成功 (${chineseFontBytes.byteLength} bytes)` : '失败');

    // 检测内容是否包含中文
    const allText = [testName, testSampleName, testSampleType, ...groups.flatMap((g) => [g.correct, ...g.options])].join('');
    const hasChinese = containsChinese(allText);
    console.log('[PDF] Step 3: 内容包含中文:', hasChinese);

    // 如果内容包含中文但字体加载失败，直接报错
    if (hasChinese && !chineseFontBytes) {
      const errorMsg = '中文字体加载失败，无法生成包含中文的 PDF。\n\n解决方案：\n1. 检查网络连接\n2. 或将中文字体文件（如 NotoSansSC-Regular.otf）放到 public/fonts/ 目录';
      console.error('[PDF] ✗', errorMsg);
      setError(errorMsg);
      setStatus('');
      setLoading?.(false);
      return;
    }

    console.log('[PDF] Step 4: 嵌入字体...');
    setStatus('正在嵌入字体...');
    const font = chineseFontBytes
      ? await pdfDoc.embedFont(chineseFontBytes, { subset: true })
      : await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontIsChinese = Boolean(chineseFontBytes);
    console.log('[PDF] Step 4: 字体嵌入成功, fontIsChinese:', fontIsChinese);

    // 竖版 A4 尺寸
    const pageSize: [number, number] = [595, 842];
    const margin = 36;

    // ========== 第一页：摘要页 ==========
    console.log('[PDF] Step 5: 添加摘要页...');
    const summary = pdfDoc.addPage(pageSize);

    // 标题
    const titleSize = 16;
    const titleText = testName || '三点测试';
    summary.drawText(titleText, {
      x: margin,
      y: pageSize[1] - margin - titleSize,
      size: titleSize,
      font,
      color: rgb(0.13, 0.45, 0.85)
    });

    // 生成时间
    const timeY = pageSize[1] - margin - titleSize - 16;
    summary.drawText(`生成时间：${dayjs().format('YYYY/MM/DD HH:mm')}`, {
      x: margin,
      y: timeY,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5)
    });

    // 测试信息区域（三栏均分）
    const infoY = timeY - 32;
    const infoColWidth = (pageSize[0] - margin * 2) / 3;
    const labelColor = rgb(0.5, 0.5, 0.5);
    const valueColor = rgb(0.15, 0.15, 0.15);

    summary.drawText('测试名称', { x: margin, y: infoY, size: 8, font, color: labelColor });
    summary.drawText(testName || '-', { x: margin, y: infoY - 16, size: 10, font, color: valueColor });

    summary.drawText('测试样品', { x: margin + infoColWidth, y: infoY, size: 8, font, color: labelColor });
    summary.drawText(testSampleName || '-', { x: margin + infoColWidth, y: infoY - 16, size: 10, font, color: valueColor });

    summary.drawText('测试类型', { x: margin + infoColWidth * 2, y: infoY, size: 8, font, color: labelColor });
    summary.drawText(testSampleType || '-', { x: margin + infoColWidth * 2, y: infoY - 16, size: 10, font, color: valueColor });

    // 表格区域
    const tableTop = infoY - 52;
    const tableWidth = pageSize[0] - margin * 2;
    const colKeyWidth = 50;
    const colCorrectWidth = 60;
    const colLayoutWidth = tableWidth - colKeyWidth - colCorrectWidth;
    const cellPadding = 10;
    const headerHeight = 32;
    const rowHeight = 64; // 每行高度（包含排布+标注两行，增加间距）

    // 表头背景
    summary.drawRectangle({
      x: margin,
      y: tableTop - headerHeight,
      width: tableWidth,
      height: headerHeight,
      color: rgb(0.13, 0.45, 0.85)
    });

    // 表头文字（白色，各列居中）
    const headerTextY = tableTop - headerHeight + 10;
    const headerKey = '组别';
    const headerKeyWidth = font.widthOfTextAtSize(headerKey, 11);
    summary.drawText(headerKey, { x: margin + colKeyWidth / 2 - headerKeyWidth / 2, y: headerTextY, size: 11, font, color: rgb(1, 1, 1) });

    const headerLayout = '排布 / 标注';
    const headerLayoutWidth = font.widthOfTextAtSize(headerLayout, 11);
    summary.drawText(headerLayout, { x: margin + colKeyWidth + colLayoutWidth / 2 - headerLayoutWidth / 2, y: headerTextY, size: 11, font, color: rgb(1, 1, 1) });

    const headerCorrect = '正确';
    const headerCorrectWidth = font.widthOfTextAtSize(headerCorrect, 11);
    summary.drawText(headerCorrect, { x: margin + colKeyWidth + colLayoutWidth + colCorrectWidth / 2 - headerCorrectWidth / 2, y: headerTextY, size: 11, font, color: rgb(1, 1, 1) });

    // 表格内容
    let currentY = tableTop - headerHeight;
    const optionCellWidth = colLayoutWidth / 3;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const rowTop = currentY;
      const rowBottom = currentY - rowHeight;

      // 交替行背景
      if (i % 2 === 1) {
        summary.drawRectangle({
          x: margin,
          y: rowBottom,
          width: tableWidth,
          height: rowHeight,
          color: rgb(0.975, 0.975, 0.975)
        });
      }

      // 行分隔线
      summary.drawLine({
        start: { x: margin, y: rowBottom },
        end: { x: margin + tableWidth, y: rowBottom },
        thickness: 0.5,
        color: rgb(0.88, 0.88, 0.88)
      });

      // 组别
      const cellTextY = rowTop - 26;
      const keyWidth = font.widthOfTextAtSize(g.key, 12);
      summary.drawText(g.key, {
        x: margin + colKeyWidth / 2 - keyWidth / 2,
        y: cellTextY,
        size: 12,
        font,
        color: rgb(0.13, 0.45, 0.85)
      });

      // 排布选项
      for (let j = 0; j < 3; j++) {
        const optX = margin + colKeyWidth + j * optionCellWidth + optionCellWidth / 2;
        const optVal = g.options[j] || '-';
        const optWidth = font.widthOfTextAtSize(optVal, 12);
        summary.drawText(optVal, {
          x: optX - optWidth / 2,
          y: cellTextY,
          size: 12,
          font,
          color: rgb(0.15, 0.15, 0.15)
        });

        // 标注
        const labelVal = g.sampleLabels[j] || '';
        if (labelVal) {
          const isStandard = labelVal === '标品';
          const labelFontSize = 8;
          const labelWidth = font.widthOfTextAtSize(labelVal, labelFontSize);
          const labelBgWidth = labelWidth + 14;
          const labelBgHeight = 18;
          const labelBgX = optX - labelBgWidth / 2;
          const labelBgY = cellTextY - 26;

          summary.drawRectangle({
            x: labelBgX,
            y: labelBgY,
            width: labelBgWidth,
            height: labelBgHeight,
            color: isStandard ? rgb(0.88, 0.96, 0.90) : rgb(0.96, 0.96, 0.96),
            borderColor: isStandard ? rgb(0.35, 0.72, 0.45) : rgb(0.82, 0.82, 0.82),
            borderWidth: 0.8
          });

          summary.drawText(labelVal, {
            x: optX - labelWidth / 2,
            y: labelBgY + 5,
            size: labelFontSize,
            font,
            color: isStandard ? rgb(0.18, 0.55, 0.28) : rgb(0.45, 0.45, 0.45)
          });
        }
      }

      // 正确答案
      const correctVal = g.correct || '-';
      const correctWidth = font.widthOfTextAtSize(correctVal, 13);
      summary.drawText(correctVal, {
        x: margin + colKeyWidth + colLayoutWidth + colCorrectWidth / 2 - correctWidth / 2,
        y: cellTextY,
        size: 13,
        font,
        color: rgb(0.13, 0.45, 0.85)
      });

      currentY = rowBottom;
    }

    // 表格底部边框
    summary.drawLine({
      start: { x: margin, y: currentY },
      end: { x: margin + tableWidth, y: currentY },
      thickness: 0.5,
      color: rgb(0.88, 0.88, 0.88)
    });

    // ========== 第二页：二维码页 ==========
    console.log('[PDF] Step 6: 添加二维码页...');
    const qrPageSize: [number, number] = [842, 595]; // 横版 A4
    const qrPage = pdfDoc.addPage(qrPageSize);
    const qrMargin = 12;
    const qrCols = 8;
    const qrRows = groups.length; // 6行（6个组）
    const rowGap = 8; // 行间裁剪间距
    const totalRowGap = rowGap * (qrRows - 1);
    const qrCellW = (qrPageSize[0] - qrMargin * 2) / qrCols;
    const qrCellH = (qrPageSize[1] - qrMargin * 2 - totalRowGap) / qrRows;
    const qrLabelSize = 8;
    const qrSize = Math.min(qrCellW - 6, qrCellH - 16);

    console.log('[PDF] Step 7: 生成二维码图片...');
    const qrImages = await Promise.all(
      groups.map(async (g) => {
        const text = g.qrSource || '缺少链接';
        try {
          const dataUrl = await QRCode.toDataURL(text, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 512
          });
          const image = await pdfDoc.embedPng(dataUrl);
          return { key: g.key, image };
        } catch (qrErr) {
          console.error(`[PDF]   - ${g.key} 二维码生成/嵌入失败:`, qrErr);
          throw qrErr;
        }
      })
    );

    console.log('[PDF] Step 8: 绘制二维码到页面...');
    groups.forEach((g, rowIdx) => {
      const img = qrImages.find((i) => i.key === g.key)?.image;
      const rowOffsetY = rowIdx * (qrCellH + rowGap);

      for (let col = 0; col < qrCols; col++) {
        const cellX = qrMargin + col * qrCellW;
        const cellY = qrPageSize[1] - qrMargin - rowOffsetY - qrCellH;

        if (img) {
          const imgX = cellX + (qrCellW - qrSize) / 2;
          const imgY = cellY + (qrCellH - qrSize - 12) / 2 + 12;
          qrPage.drawImage(img, { x: imgX, y: imgY, width: qrSize, height: qrSize });
        }

        const label = g.key;
        const labelWidth = font.widthOfTextAtSize(label, qrLabelSize);
        const labelX = cellX + (qrCellW - labelWidth) / 2;
        qrPage.drawText(label, {
          x: labelX,
          y: cellY + 3,
          size: qrLabelSize,
          font,
          color: rgb(0.35, 0.35, 0.35)
        });
      }
    });

    console.log('[PDF] Step 9: 保存 PDF 文档...');
    const pdfBytes = await pdfDoc.save();
    console.log('[PDF] Step 9: PDF 保存成功, 大小:', pdfBytes.byteLength, 'bytes');

    const uint8Array = new Uint8Array(pdfBytes);
    const blob = new Blob([uint8Array], { type: 'application/pdf' });
    const fileName = `${testName || '三点测试'}_${dayjs().format('YYYYMMDD_HHmm')}.pdf`;
    console.log('[PDF] Step 10: 准备下载, 文件名:', fileName, 'Blob 大小:', blob.size);

    // 上传到飞书附件字段
    if (recordId && tableId && attachmentFieldId) {
      try {
        console.log('[PDF] Step 11: 开始上传PDF到飞书附件字段...');
        setStatus('正在上传PDF到飞书附件字段...');
        
        const table = await bitable.base.getTableById(tableId);
        const attachmentField = await table.getField<IAttachmentField>(attachmentFieldId);
        
        // 将Blob转换为File对象
        const file = new File([blob], fileName, { type: 'application/pdf' });
        
        // 上传到附件字段
        const success = await attachmentField.setValue(recordId, file);
        
        if (success) {
          console.log('[PDF] Step 11: PDF上传成功');
          setStatus(
            fontIsChinese
              ? 'PDF 已生成并上传到附件字段（已嵌入中文字体）'
              : 'PDF 已生成并上传到附件字段（未加载到中文字体，中文可能显示异常）'
          );
        } else {
          console.warn('[PDF] Step 11: PDF上传失败');
          setStatus('PDF 已生成，但上传到附件字段失败');
        }
      } catch (uploadErr) {
        console.error('[PDF] Step 11: 上传PDF到飞书失败:', uploadErr);
        setStatus('PDF 已生成，但上传到附件字段时出错');
      }
    }

    // 同时提供下载功能
    try {
      if ((navigator as any).msSaveOrOpenBlob) {
        (navigator as any).msSaveOrOpenBlob(blob, fileName);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
          URL.revokeObjectURL(url);
        }, 200);
      }
      
      // 如果已经上传成功，状态已经在上面设置了，这里不再覆盖
      if (!recordId || !tableId || !attachmentFieldId) {
        setStatus(
          fontIsChinese
            ? 'PDF 已生成并下载（已嵌入中文字体）'
            : 'PDF 已生成并下载（未加载到中文字体，中文可能显示异常）'
        );
      }
    } catch (downloadErr) {
      console.error('[PDF] 下载方式失败，尝试新窗口打开:', downloadErr);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      
      // 如果已经上传成功，状态已经在上面设置了，这里不再覆盖
      if (!recordId || !tableId || !attachmentFieldId) {
        setStatus(
          fontIsChinese
            ? 'PDF 已生成，请在新窗口保存（已嵌入中文字体）'
            : 'PDF 已生成，请在新窗口保存（未加载到中文字体，中文可能显示异常）'
        );
      }
    }
  } catch (err) {
    console.error('[PDF] ===== PDF 生成失败 =====', err);
    setError('生成 PDF 失败，请检查字段数据或重试。');
    setStatus('');
  } finally {
    setLoading?.(false);
    console.log('[PDF] ===== buildPdf 执行结束 =====');
  }
}

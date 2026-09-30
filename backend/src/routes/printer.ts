import { Router, Request, Response } from 'express';
import { printerService } from '../services/printer';
import { dbAll } from '../db/database';

export const printerRouter = Router();

// Helper to fetch current settings
async function getSettingsMap(): Promise<Record<string, string>> {
  try {
    const rows = await dbAll<{ key: string; value: string }>('SELECT key, value FROM settings');
    const settingsMap: Record<string, string> = {};
    for (const r of rows) {
      settingsMap[r.key] = r.value;
    }
    return settingsMap;
  } catch {
    return {};
  }
}

// GET /api/print/printers - List installed printers
printerRouter.get('/printers', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await printerService.getPrinters();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/print/receipt - Print customer receipt directly
printerRouter.post('/receipt', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.platform !== 'win32') {
      res.status(400).json({ error: 'Direct Windows Spooler is only available on a local Windows host. Use Browser Print.' });
      return;
    }

    const { receipt, settings, open_drawer, printer_name, receipt_width, image_base64 } = req.body;
    if (!receipt) {
      res.status(400).json({ error: 'Missing receipt payload' });
      return;
    }

    // Merge settings if not passed
    let activeSettings = settings;
    if (!activeSettings) {
      activeSettings = await getSettingsMap();
    }

    // Debug: save received receipt image to inspect what frontend captured
    if (image_base64) {
      try {
        const cleanBase64 = image_base64.replace(/^data:image\/\w+;base64,/, '');
        require('fs').writeFileSync('latest_receipt.png', Buffer.from(cleanBase64, 'base64'));
        console.log('Saved latest_receipt.png (bytes:', cleanBase64.length, ')');
      } catch (saveErr) {
        console.warn('Failed to save debug image:', saveErr);
      }
    } else {
      console.warn('No image_base64 provided in print request! Falling back to text mode.');
    }

    const result = await printerService.printReceipt({
      receipt,
      settings: activeSettings,
      open_drawer,
      printer_name,
      receipt_width,
      image_base64,
    });

    res.json(result);
  } catch (err: any) {
    console.error('Failed to print receipt:', err);
    res.status(500).json({ error: err.message || 'Failed to spool receipt' });
  }
});

// POST /api/print/drawer - Trigger cash drawer kick
printerRouter.post('/drawer', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.platform !== 'win32') {
      res.status(400).json({ error: 'Cash drawer trigger requires local Windows host.' });
      return;
    }

    const { printer_name } = req.body;
    const result = await printerService.kickDrawer(printer_name);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to trigger cash drawer' });
  }
});

// POST /api/print/test - Print test page
printerRouter.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.platform !== 'win32') {
      res.status(400).json({ error: 'Test print via OS spooler requires local Windows host. Use Browser Print.' });
      return;
    }

    const { printer_name, receipt_width } = req.body;
    const result = await printerService.testPrint(printer_name, receipt_width);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to print test slip' });
  }
});

// POST /api/print/labels - Print product barcode sticker/label
printerRouter.post('/labels', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.platform !== 'win32') {
      res.status(400).json({ error: 'Direct Windows Spooler is only available on a local Windows host. Use Browser Print.' });
      return;
    }

    const { printer_name, label_width_mm, label_height_mm, copies, products, image_base64 } = req.body;

    // Fallback printer name from settings if not supplied
    let targetPrinter = printer_name;
    if (!targetPrinter) {
      const settings = await getSettingsMap();
      targetPrinter = settings.printer_name || 'Xprinter XP-365B';
    }

    const result = await printerService.printLabels({
      printer_name: targetPrinter,
      label_width_mm: Number(label_width_mm) || 50,
      label_height_mm: Number(label_height_mm) || 20,
      copies: Number(copies) || 1,
      products: products || [],
      image_base64,
    });

    res.json(result);
  } catch (err: any) {
    console.error('Failed to print barcode labels:', err);
    res.status(500).json({ error: err.message || 'Failed to spool barcode labels' });
  }
});


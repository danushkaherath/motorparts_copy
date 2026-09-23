import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  isThermal: boolean;
}

export interface PrinterListResult {
  defaultPrinter: string;
  printers: PrinterInfo[];
}

export interface PrintReceiptPayload {
  receipt: any;
  settings?: any;
  open_drawer?: boolean;
  printer_name?: string;
  receipt_width?: number;
  image_base64?: string;
  image_path?: string;
}

export interface PrintLabelsPayload {
  printer_name?: string;
  label_width_mm: number;
  label_height_mm: number;
  copies: number;
  products: any[];
  image_base64?: string;
}

function getScriptPath(): string {
  // Check dist first, then src
  const inDist = path.join(__dirname, 'printer_engine.ps1');
  if (fs.existsSync(inDist)) {
    return inDist;
  }
  const inSrc = path.join(__dirname, '../../src/services/printer_engine.ps1');
  if (fs.existsSync(inSrc)) {
    return inSrc;
  }
  // Fallback to current dir or src relative
  const directSrc = path.resolve(process.cwd(), 'src/services/printer_engine.ps1');
  if (fs.existsSync(directSrc)) {
    return directSrc;
  }
  return inDist;
}

function runPowerShell(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = getScriptPath();
    const psArgs = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      ...args,
    ];

    execFile('powershell.exe', psArgs, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('PowerShell Spooler Error:', stderr || error.message);
        return reject(new Error(stderr || error.message));
      }
      try {
        const trimmed = stdout.trim();
        const parsed = JSON.parse(trimmed);
        resolve(parsed);
      } catch (parseErr) {
        resolve({ raw: stdout.trim() });
      }
    });
  });
}

export const printerService = {
  /**
   * Get list of installed Windows printers and default printer
   */
  async getPrinters(): Promise<PrinterListResult> {
    try {
      const res = await runPowerShell(['-Action', 'list']);
      return res as PrinterListResult;
    } catch (err: any) {
      console.error('Failed to list printers:', err);
      return { defaultPrinter: 'Xprinter XP-365B', printers: [] };
    }
  },

  /**
   * Send direct raw pulse to open cash drawer
   */
  async kickDrawer(printerName?: string): Promise<{ success: boolean; printer: string; message: string }> {
    const args = ['-Action', 'drawer'];
    if (printerName) {
      args.push('-PrinterName', printerName);
    }
    return runPowerShell(args);
  },

  /**
   * Send test print slip to verify printer connection
   */
  async testPrint(printerName?: string, width = 80): Promise<{ success: boolean; printer: string; message: string }> {
    const args = ['-Action', 'test', '-ReceiptWidth', String(width)];
    if (printerName) {
      args.push('-PrinterName', printerName);
    }
    return runPowerShell(args);
  },

  /**
   * Print customer receipt directly through Windows Spooler
   */
  async printReceipt(payload: PrintReceiptPayload): Promise<{ success: boolean; printer: string; message: string }> {
    const { receipt, settings, open_drawer, printer_name, receipt_width, image_base64, image_path } = payload;
    
    // Prepare JSON payload with Sinhala & English labels
    const printData = {
      receipt,
      settings: settings || {},
      labels: {
        total_savings_title: 'ඔබ ලැබූ ලාභය',
        item_savings: 'ලාභය',
      },
      image_base64,
      image_path,
    };

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `pos_receipt_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
    
    // Write UTF-8 JSON for PowerShell
    fs.writeFileSync(tempFile, JSON.stringify(printData, null, 2), { encoding: 'utf-8' });

    try {
      const width = receipt_width || (settings?.receipt_width === '58' ? 58 : 80);
      const args = [
        '-Action', 'print',
        '-ReceiptJsonPath', tempFile,
        '-ReceiptWidth', String(width),
      ];

      if (printer_name || settings?.printer_name) {
        args.push('-PrinterName', printer_name || settings.printer_name);
      }

      // If open_drawer requested or payment was CASH and auto-drawer is true
      const shouldOpenDrawer = open_drawer ?? (
        receipt?.payment_method === 'CASH' &&
        settings?.printer_open_drawer !== 'false'
      );

      if (shouldOpenDrawer) {
        args.push('-OpenDrawer');
      }

      const result = await runPowerShell(args);
      return result;
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanErr) {
        // Non-fatal
      }
    }
  },

  /**
   * Print barcode stickers / labels directly through Windows Spooler
   */
  async printLabels(payload: PrintLabelsPayload): Promise<{ success: boolean; printer: string; message: string }> {
    const { printer_name, label_width_mm, label_height_mm, copies, products, image_base64 } = payload;

    const labelData = {
      label_width_mm: label_width_mm || 50,
      label_height_mm: label_height_mm || 20,
      copies: copies || 1,
      products: products || [],
      image_base64,
    };

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `pos_label_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);

    fs.writeFileSync(tempFile, JSON.stringify(labelData, null, 2), { encoding: 'utf-8' });

    try {
      const args = [
        '-Action', 'labels',
        '-ReceiptJsonPath', tempFile,
      ];

      if (printer_name) {
        args.push('-PrinterName', printer_name);
      }

      const result = await runPowerShell(args);
      return result;
    } finally {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanErr) {
        // Non-fatal
      }
    }
  },
};

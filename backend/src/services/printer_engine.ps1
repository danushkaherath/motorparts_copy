# PowerShell Thermal Printer Engine for Xprinter XP-365B & Windows Thermal Printers
param (
    [Parameter(Mandatory=$false)][string]$Action = "list",
    [Parameter(Mandatory=$false)][string]$PrinterName = "",
    [Parameter(Mandatory=$false)][string]$ReceiptJsonPath = "",
    [Parameter(Mandatory=$false)][switch]$OpenDrawer,
    [Parameter(Mandatory=$false)][int]$ReceiptWidth = 80
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

# Raw Win32 Spooler helper for ESC/POS drawer kick & paper cut
$rawHelperSource = @"
using System;
using System.Runtime.InteropServices;

public class WinSpooler {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", ExactSpelling = true, SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", ExactSpelling = true, SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", ExactSpelling = true, SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", ExactSpelling = true, SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", ExactSpelling = true, SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendRawBytes(string szPrinterName, byte[] bytes) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "POS Spooler Command";
        di.pDataType = "RAW";
        if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int dwWritten = 0;
                    bool success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                    EndDocPrinter(hPrinter);
                    ClosePrinter(hPrinter);
                    return success;
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return false;
    }
}
"@

try {
    Add-Type -TypeDefinition $rawHelperSource
} catch {
    # Type may already be loaded in current session
}

function Resolve-TargetPrinter([string]$target) {
    $installed = [System.Drawing.Printing.PrinterSettings]::InstalledPrinters
    if ([string]::IsNullOrWhiteSpace($target)) {
        $doc = New-Object System.Drawing.Printing.PrintDocument
        if ($doc.PrinterSettings.IsValid) {
            return $doc.PrinterSettings.PrinterName
        }
        foreach ($p in $installed) {
            if ($p -match "XP-365" -or $p -match "Xprinter") {
                return $p
            }
        }
    } else {
        foreach ($p in $installed) {
            if ($p -eq $target -or $p -like "*$target*") {
                return $p
            }
        }
    }
    if ($installed.Count -gt 0) {
        return $installed[0]
    }
    throw "No printer found on this system."
}

# ACTION: LIST PRINTERS
if ($Action -eq "list") {
    $defaultDoc = New-Object System.Drawing.Printing.PrintDocument
    $defaultName = if ($defaultDoc.PrinterSettings.IsValid) { $defaultDoc.PrinterSettings.PrinterName } else { "" }
    $printers = @()
    foreach ($p in [System.Drawing.Printing.PrinterSettings]::InstalledPrinters) {
        $isDef = ($p -eq $defaultName)
        $isXprinter = ($p -match "XP-" -or $p -match "Xprinter" -or $p -match "POS")
        $printers += @{
            name = $p
            isDefault = $isDef
            isThermal = $isXprinter
        }
    }
    $result = @{
        printers = $printers
        defaultPrinter = $defaultName
    }
    $result | ConvertTo-Json -Compress
    exit 0
}

# ACTION: DRAWER KICK
if ($Action -eq "drawer") {
    $printer = Resolve-TargetPrinter $PrinterName
    $pulse = [byte[]]@(0x1B, 0x70, 0x00, 0x19, 0xFA)
    $ok = [WinSpooler]::SendRawBytes($printer, $pulse)
    @{ success = $ok; printer = $printer; message = "Cash drawer kick sent" } | ConvertTo-Json -Compress
    exit 0
}

# Helper to select the 10-inch stock ("New Stock" 300x1000) native to this printer driver
function Set-TallestStock($targetDoc) {
    foreach ($p in $targetDoc.PrinterSettings.PaperSizes) {
        if ($p.PaperName -like "*New Stock*" -or $p.Height -ge 800) {
            $targetDoc.DefaultPageSettings.PaperSize = $p
            return
        }
    }
    foreach ($p in $targetDoc.PrinterSettings.PaperSizes) {
        if ($p.Height -gt 500) {
            $targetDoc.DefaultPageSettings.PaperSize = $p
            return
        }
    }
}

# ACTION: TEST PRINT
if ($Action -eq "test") {
    $printer = Resolve-TargetPrinter $PrinterName
    $printableWidth = if ($ReceiptWidth -eq 58) { 200 } else { 295 }
    $canvasBmp = New-Object System.Drawing.Bitmap($printableWidth, 500)
    $g = [System.Drawing.Graphics]::FromImage($canvasBmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $fontTitle = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $fontBold = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $fontRegular = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
    $fontSmall = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Regular)
    $brush = [System.Drawing.Brushes]::Black
    $centerFormat = New-Object System.Drawing.StringFormat
    $centerFormat.Alignment = [System.Drawing.StringAlignment]::Center

    $y = 10
    $g.DrawString("XPRINTER XP-365B", $fontTitle, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 24)), $centerFormat)
    $y += 24
    $g.DrawString("DIRECT BACKEND SPOOLER READY", $fontBold, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 20)), $centerFormat)
    $y += 20
    $g.DrawString("------------------------------------------------", $fontSmall, $brush, 0, $y)
    $y += 15
    $g.DrawString("Date: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $fontRegular, $brush, 0, $y)
    $y += 16
    $g.DrawString("Printer: " + $printer, $fontRegular, $brush, 0, $y)
    $y += 16
    $g.DrawString("Status: Online & Connected", $fontRegular, $brush, 0, $y)
    $y += 20
    $g.DrawString("------------------------------------------------", $fontSmall, $brush, 0, $y)
    $y += 15
    $g.DrawString("*** TEST PRINT SUCCESSFUL ***", $fontBold, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 20)), $centerFormat)
    $y += 30

    $finalHeight = [int]($y + 10)
    $g.Dispose()

    $cropRect = New-Object System.Drawing.Rectangle(0, 0, $printableWidth, $finalHeight)
    $croppedBmp = $canvasBmp.Clone($cropRect, $canvasBmp.PixelFormat)
    $canvasBmp.Dispose()
    $croppedBmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone)

    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $printer
    $doc.DocumentName = "POS Test Receipt"
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $doc.OriginAtMargins = $false
    Set-TallestStock $doc

    $script:_testBmp = $croppedBmp
    $doc.add_PrintPage({
        param($sender, $e)
        $rect = New-Object System.Drawing.Rectangle(2, 28, $script:_testBmp.Width, $script:_testBmp.Height)
        $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $e.Graphics.DrawImage($script:_testBmp, $rect)
        $e.HasMorePages = $false
    })

    $doc.Print()
    $croppedBmp.Dispose()

    @{ success = $true; printer = $printer; message = "Test print completed" } | ConvertTo-Json -Compress
    exit 0
}

# ACTION: PRINT LABELS (Xprinter XP-365B Barcode Stickers)
if ($Action -eq "labels") {
    if (-not (Test-Path $ReceiptJsonPath)) {
        throw "Label JSON file not found at: $ReceiptJsonPath"
    }

    $jsonContent = [System.IO.File]::ReadAllText($ReceiptJsonPath, [System.Text.Encoding]::UTF8)
    $data = $jsonContent | ConvertFrom-Json
    $printer = Resolve-TargetPrinter $PrinterName
    $copies = if ($data.copies) { [int]$data.copies } else { 1 }
    $labelWidthMm = if ($data.label_width_mm) { [double]$data.label_width_mm } else { 50 }
    $labelHeightMm = if ($data.label_height_mm) { [double]$data.label_height_mm } else { 20 }

    if ($data.image_base64) {
        $base64Data = $data.image_base64
        if ($base64Data -match "base64,(.*)") {
            $base64Data = $matches[1]
        }
        $bytes = [Convert]::FromBase64String($base64Data)
        $tempImgPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), ("label_img_" + [System.Guid]::NewGuid().ToString() + ".png"))
        [System.IO.File]::WriteAllBytes($tempImgPath, $bytes)

        if (Test-Path $tempImgPath) {
            $img = [System.Drawing.Image]::FromFile($tempImgPath)
            
            $doc = New-Object System.Drawing.Printing.PrintDocument
            $doc.PrinterSettings.PrinterName = $printer
            $prodName = if ($data.products -and $data.products.Count -gt 0) { $data.products[0].name } else { "Sticker" }
            $doc.DocumentName = "POS Label - " + $prodName
            $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
            $doc.OriginAtMargins = $false
            if ($copies -gt 1) {
                $doc.PrinterSettings.Copies = [short]$copies
            }

            # Map width & height to hundredths of an inch (100 DPI standard .NET PaperSize)
            $wHundredths = [int]($labelWidthMm / 25.4 * 100)
            $hHundredths = [int]($labelHeightMm / 25.4 * 100)

            # Match existing stock size on printer or set custom
            $matchedSize = $null
            foreach ($ps in $doc.PrinterSettings.PaperSizes) {
                if ([Math]::Abs($ps.Width - $wHundredths) -le 15 -and [Math]::Abs($ps.Height - $hHundredths) -le 15) {
                    $matchedSize = $ps
                    break
                }
            }
            if ($matchedSize) {
                $doc.DefaultPageSettings.PaperSize = $matchedSize
            } else {
                try {
                    $customSize = New-Object System.Drawing.Printing.PaperSize("Custom Label", $wHundredths, $hHundredths)
                    $doc.DefaultPageSettings.PaperSize = $customSize
                } catch {
                    # Driver may use default stock
                }
            }

            $script:_labelImg = $img
            $doc.add_PrintPage({
                param($sender, $e)
                $bounds = $e.PageBounds
                $targetW = if ($bounds.Width -gt 0) { $bounds.Width } else { $script:_labelImg.Width }
                $targetH = if ($bounds.Height -gt 0) { $bounds.Height } else { $script:_labelImg.Height }
                $rect = New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)
                
                $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
                $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
                $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
                $e.Graphics.DrawImage($script:_labelImg, $rect)
                $e.HasMorePages = $false
            })

            $doc.Print()
            $img.Dispose()
            Remove-Item $tempImgPath -ErrorAction SilentlyContinue

            @{ success = $true; printer = $printer; message = "Spooler: printed $copies label(s) successfully" } | ConvertTo-Json -Compress
            exit 0
        }
    }

    @{ success = $false; printer = $printer; message = "No label image provided" } | ConvertTo-Json -Compress
    exit 0
}

# ACTION: PRINT RECEIPT
if ($Action -eq "print") {
    if (-not (Test-Path $ReceiptJsonPath)) {
        throw "Receipt JSON file not found at: $ReceiptJsonPath"
    }

    $jsonContent = [System.IO.File]::ReadAllText($ReceiptJsonPath, [System.Text.Encoding]::UTF8)
    $data = $jsonContent | ConvertFrom-Json
    $receipt = $data.receipt
    $settings = $data.settings
    $labels = $data.labels
    $printer = Resolve-TargetPrinter $PrinterName

    # =========================================================================
    # OPTION A: DIRECT PIXEL-PERFECT RASTER IMAGE PRINTING (100% MATCH TO SCREEN)
    # =========================================================================
    if ($data.image_path -or $data.image_base64) {
        $imagePath = $data.image_path
        $tempImgCreated = $false
        if (-not $imagePath -and $data.image_base64) {
            $base64Data = $data.image_base64
            if ($base64Data -match "base64,(.*)") {
                $base64Data = $matches[1]
            }
            $bytes = [Convert]::FromBase64String($base64Data)
            $imagePath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), ("receipt_img_" + [System.Guid]::NewGuid().ToString() + ".png"))
            [System.IO.File]::WriteAllBytes($imagePath, $bytes)
            $tempImgCreated = $true
        }

        if (Test-Path $imagePath) {
            $img = [System.Drawing.Image]::FromFile($imagePath)
            # Rotate 180 degrees so the receipt feeds header-first and text is right-side up
            $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone)
            $script:_printImg = $img
            $doc = New-Object System.Drawing.Printing.PrintDocument
            $doc.PrinterSettings.PrinterName = $printer
            $doc.DocumentName = "POS Receipt - " + ($receipt.order_number)
            $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
            $doc.OriginAtMargins = $false
            Set-TallestStock $doc

            # Pre-calculate target dimensions using native printer stock
            $targetWidth = if ($ReceiptWidth -eq 58) { 200 } else { 295 }
            $scale = $targetWidth / $img.Width
            $targetHeight = [int]($img.Height * $scale)

            $doc.add_PrintPage({
                param($sender, $e)
                $w = if ($ReceiptWidth -eq 58) { 200 } else { 295 }
                $s = $w / $script:_printImg.Width
                $h = [int]($script:_printImg.Height * $s)
                # Start at Y=28 (verified calibration position where THUSHAN prints clearly)
                $rect = New-Object System.Drawing.Rectangle(2, 28, $w, $h)
                # NearestNeighbor produces the sharpest text on thermal printers
                $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
                $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
                $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
                $e.Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::AssumeLinear
                $e.Graphics.DrawImage($script:_printImg, $rect)
                $e.HasMorePages = $false
            })

            $doc.Print()
            $img.Dispose()

            if ($tempImgCreated) {
                Remove-Item $imagePath -ErrorAction SilentlyContinue
            }

            # Hardware Cash Drawer Kick if requested
            if ($OpenDrawer) {
                $pulse = [byte[]]@(0x1B, 0x70, 0x00, 0x19, 0xFA)
                [WinSpooler]::SendRawBytes($printer, $pulse) | Out-Null
            }

            @{ success = $true; printer = $printer; message = "Receipt printed successfully from screen image" } | ConvertTo-Json -Compress
            exit 0
        }
    }

    # =========================================================================
    # OPTION B: DYNAMIC GDI TEXT PRINTING (FALLBACK)
    # =========================================================================
    $printableWidth = if ($ReceiptWidth -eq 58) { 200 } else { 295 }
    $maxHeight = 3000
    $canvasBmp = New-Object System.Drawing.Bitmap($printableWidth, $maxHeight)
    $g = [System.Drawing.Graphics]::FromImage($canvasBmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

        # Fonts matching the screen
        $fontTitle = New-Object System.Drawing.Font("Nirmala UI", 11, [System.Drawing.FontStyle]::Bold)
        $fontBold = New-Object System.Drawing.Font("Nirmala UI", 8.5, [System.Drawing.FontStyle]::Bold)
        $fontRegular = New-Object System.Drawing.Font("Nirmala UI", 8.5, [System.Drawing.FontStyle]::Regular)
        $fontSmall = New-Object System.Drawing.Font("Nirmala UI", 7.5, [System.Drawing.FontStyle]::Regular)
        $fontSmallBold = New-Object System.Drawing.Font("Nirmala UI", 7.5, [System.Drawing.FontStyle]::Bold)
        $fontSavingsBig = New-Object System.Drawing.Font("Nirmala UI", 11, [System.Drawing.FontStyle]::Bold)
        $brush = [System.Drawing.Brushes]::Black

        $centerFormat = New-Object System.Drawing.StringFormat
        $centerFormat.Alignment = [System.Drawing.StringAlignment]::Center

        $rightFormat = New-Object System.Drawing.StringFormat
        $rightFormat.Alignment = [System.Drawing.StringAlignment]::Far

        $leftFormat = New-Object System.Drawing.StringFormat
        $leftFormat.Alignment = [System.Drawing.StringAlignment]::Near

        $currency = if ($settings.currency_symbol) { $settings.currency_symbol } else { "Rs. " }
        # Start at Y=28 so the store name THUSHAN begins in the printable zone
        $y = 28

        # 1. STORE HEADER
        $storeName = if ($settings.store_name) { $settings.store_name.ToUpper() } else { "GROCERY STORE POS" }
        $g.DrawString($storeName, $fontTitle, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 20)), $centerFormat)
        $y += 20

        if ($settings.store_address) {
            $g.DrawString($settings.store_address, $fontSmall, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 15)), $centerFormat)
            $y += 14
        }
        if ($settings.store_phone) {
            $g.DrawString("Tel: " + $settings.store_phone, $fontSmall, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 15)), $centerFormat)
            $y += 14
        }

        # Divider
        $y += 4
        $dashPen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)
        $dashPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
        $g.DrawLine($dashPen, 0, $y, $printableWidth, $y)
        $y += 8

        # 2. METADATA (Stacked with full right alignment matching screen)
        $g.DrawString("ORDER:", $fontSmall, $brush, 0, $y)
        $g.DrawString($receipt.order_number, $fontBold, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
        $y += 15

        $dateFormatted = (Get-Date $receipt.created_at -Format "M/d/yyyy, h:mm:ss tt")
        $g.DrawString("DATE:", $fontSmall, $brush, 0, $y)
        $g.DrawString($dateFormatted, $fontSmall, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
        $y += 15

        $g.DrawString("CASHIER:", $fontSmall, $brush, 0, $y)
        $g.DrawString($receipt.cashier_name, $fontSmall, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
        $y += 15

        if ($receipt.customer_name) {
            $g.DrawString("CUSTOMER:", $fontSmall, $brush, 0, $y)
            $custStr = $receipt.customer_name
            if ($receipt.customer_phone) { $custStr += " (" + $receipt.customer_phone + ")" }
            $g.DrawString($custStr, $fontBold, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
            $y += 15
        }

        # Divider
        $y += 2
        $g.DrawLine($dashPen, 0, $y, $printableWidth, $y)
        $y += 8

        # 3. LINE ITEMS HEADER
        $g.DrawString("ITEM DESCRIPTION", $fontSmallBold, $brush, 0, $y)
        $g.DrawString("TOTAL", $fontSmallBold, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
        $y += 15
        $dotPen = New-Object System.Drawing.Pen([System.Drawing.Color]::Gray, 1)
        $dotPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dot
        $g.DrawLine($dotPen, 0, $y, $printableWidth, $y)
        $y += 8

        $totalItemsSavings = 0

        # 4. ITEMS
        foreach ($item in $receipt.items) {
            $mrp = [double]($item.mrp)
            $unitPrice = [double]($item.unit_price)
            $qty = [double]($item.quantity)
            $subtotal = [double]($item.subtotal)

            if ($mrp -gt $unitPrice) {
                $totalItemsSavings += (($mrp - $unitPrice) * $qty)
            }

            # Product Name - measure exact height so wrapping never collides
            $pNameWidth = $printableWidth - 80
            $sizeF = $g.MeasureString($item.product_name, $fontRegular, [int]$pNameWidth)
            $nameHeight = [Math]::Max(14, [int]($sizeF.Height))

            $pNameRect = New-Object System.Drawing.RectangleF(0, $y, $pNameWidth, $nameHeight)
            $g.DrawString($item.product_name, $fontRegular, $brush, $pNameRect, $leftFormat)
            
            # Subtotal aligned on the first line
            $subtotalStr = $currency + $subtotal.ToString("0.00")
            $g.DrawString($subtotalStr, $fontBold, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 16)), $rightFormat)
            $y += $nameHeight + 2

            # Qty x Unit Price
            $unitStr = if ($item.unit) { $item.unit } else { "pcs" }
            $qtyStr = $qty.ToString("0.###") + " " + $unitStr + " x " + $currency + $unitPrice.ToString("0.00")
            $g.DrawString($qtyStr, $fontSmall, $brush, 0, $y)
            $y += 13

            # MRP / Savings breakdown
            if ($mrp -gt $unitPrice) {
                $itemSavingLabel = if ($labels -and $labels.item_savings) { $labels.item_savings } else { "Savings" }
                $g.DrawString("MRP: " + $currency + $mrp.ToString("0.00"), $fontSmall, $brush, 0, $y)
                $savingRight = $itemSavingLabel + ": " + $currency + (($mrp - $unitPrice) * $qty).ToString("0.00")
                $g.DrawString($savingRight, $fontSmall, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
                $y += 14
            }

            # Dotted divider between items
            $y += 2
            $g.DrawLine($dotPen, 0, $y, $printableWidth, $y)
            $y += 6
        }

        # Divider
        $y += 2
        $g.DrawLine($dashPen, 0, $y, $printableWidth, $y)
        $y += 8

        # 5. TOTALS
        $subtotalAmt = [double]($receipt.subtotal)
        $discountAmt = [double]($receipt.discount_amount)
        $taxAmt = [double]($receipt.tax_amount)
        $totalDue = [double]($receipt.total_amount)

        $g.DrawString("SUBTOTAL:", $fontRegular, $brush, 0, $y)
        $g.DrawString($currency + $subtotalAmt.ToString("0.00"), $fontRegular, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
        $y += 15

        if ($discountAmt -gt 0) {
            $g.DrawString("DISCOUNT:", $fontRegular, $brush, 0, $y)
            $g.DrawString("-" + $currency + $discountAmt.ToString("0.00"), $fontRegular, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
            $y += 15
        }

        if ($taxAmt -gt 0) {
            $g.DrawString("TAX:", $fontRegular, $brush, 0, $y)
            $g.DrawString($currency + $taxAmt.ToString("0.00"), $fontRegular, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
            $y += 15
        }

        # Divider before Total Due
        $y += 2
        $g.DrawLine($dashPen, 0, $y, $printableWidth, $y)
        $y += 8

        # TOTAL DUE (Big & bold like screen)
        $g.DrawString("TOTAL DUE:", $fontTitle, $brush, 0, $y)
        $g.DrawString($currency + $totalDue.ToString("0.00"), $fontTitle, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 22)), $rightFormat)
        $y += 26

        # 6. SAVINGS BANNER (Centered box with 3 lines matching screen)
        $grandSavings = [Math]::Round(($totalItemsSavings + $discountAmt), 2)
        if ($grandSavings -gt 0) {
            $bannerHeight = 52
            $bannerRect = New-Object System.Drawing.RectangleF(2, $y, ($printableWidth - 4), $bannerHeight)
            $g.DrawRectangle($dashPen, $bannerRect.X, $bannerRect.Y, $bannerRect.Width, $bannerRect.Height)

            $bannerTitle = if ($labels -and $labels.total_savings_title) { $labels.total_savings_title } else { "TOTAL DISCOUNT" }
            $g.DrawString("*** " + $bannerTitle + " ***", $fontBold, $brush, (New-Object System.Drawing.RectangleF(0, ($y + 5), $printableWidth, 14)), $centerFormat)
            $g.DrawString("SPECIAL DISCOUNT APPLIED", $fontSmall, $brush, (New-Object System.Drawing.RectangleF(0, ($y + 20), $printableWidth, 14)), $centerFormat)
            $g.DrawString($currency + $grandSavings.ToString("0.00"), $fontSavingsBig, $brush, (New-Object System.Drawing.RectangleF(0, ($y + 34), $printableWidth, 18)), $centerFormat)
            $y += $bannerHeight + 12
        }

        # 7. PAYMENT DETAILS
        $payMethod = if ($receipt.payment_method) { $receipt.payment_method } else { "CASH" }
        $tender = [double]($receipt.tender_amount)
        $change = [double]($receipt.change_amount)

        $g.DrawString("TENDER [" + $payMethod + "]:", $fontRegular, $brush, 0, $y)
        $g.DrawString($currency + $tender.ToString("0.00"), $fontRegular, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
        $y += 15

        if ($payMethod -eq "CASH" -and $change -ge 0) {
            $g.DrawString("CHANGE DUE:", $fontRegular, $brush, 0, $y)
            $g.DrawString($currency + $change.ToString("0.00"), $fontRegular, $brush, (New-Object System.Drawing.RectangleF(0, $y, $printableWidth, 14)), $rightFormat)
            $y += 15
        } elseif ($receipt.card_reference) {
            $g.DrawString("CARD REF: " + $receipt.card_reference, $fontSmall, $brush, 0, $y)
            $y += 15
        }

        # 8. FOOTER
        $y += 6
        $g.DrawLine($dashPen, 0, $y, $printableWidth, $y)
        $y += 10

        $footerText = if ($settings.store_receipt_footer) { $settings.store_receipt_footer } else { "Thank you for shopping with us! Please retain this slip for returns." }
        $footRect = New-Object System.Drawing.RectangleF(5, $y, ($printableWidth - 10), 30)
        $g.DrawString($footerText, $fontSmall, $brush, $footRect, $centerFormat)
        $y += 45

        # Feed paper past the manual tear bar so full footer is visible before tearing
        $g.DrawString(".", $fontSmall, [System.Drawing.Brushes]::White, 10, ($y + 20))

        $finalHeight = [int]($y + 20)
        $g.Dispose()

        # Crop to actual used height, rotate 180 degrees so header emerges first
        $cropRect = New-Object System.Drawing.Rectangle(0, 0, $printableWidth, $finalHeight)
        $croppedBmp = $canvasBmp.Clone($cropRect, $canvasBmp.PixelFormat)
        $canvasBmp.Dispose()
        $croppedBmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone)

        $script:_printBmp = $croppedBmp
        $doc = New-Object System.Drawing.Printing.PrintDocument
        $doc.PrinterSettings.PrinterName = $printer
        $doc.DocumentName = "POS Receipt - " + $receipt.order_number
        $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
        $doc.OriginAtMargins = $false
        Set-TallestStock $doc

        $doc.add_PrintPage({
            param($sender, $e)
            $rect = New-Object System.Drawing.Rectangle(2, 28, $script:_printBmp.Width, $script:_printBmp.Height)
            $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
            $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
            $e.Graphics.DrawImage($script:_printBmp, $rect)
            $e.HasMorePages = $false
        })

        $doc.Print()
        $croppedBmp.Dispose()

    # Hardware Cash Drawer Kick if requested
    if ($OpenDrawer) {
        $pulse = [byte[]]@(0x1B, 0x70, 0x00, 0x19, 0xFA)
        [WinSpooler]::SendRawBytes($printer, $pulse) | Out-Null
    }

    @{ success = $true; printer = $printer; message = "Receipt printed successfully" } | ConvertTo-Json -Compress
    exit 0
}

﻿using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace Binner.Model.IO.Printing.PrinterHardware
{
    /// <summary>
    /// Label printer
    /// </summary>
    public interface ILabelPrinterHardware
    {
        /// <summary>
        /// Printer settings
        /// </summary>
        IPrinterSettings PrinterSettings { get; set; }

        /// <summary>
        /// Print a label
        /// </summary>
        /// <param name="content"></param>
        /// <param name="options">Printer options overrides</param>
        /// <returns></returns>
        Image<Rgba32> PrintLabel(LabelContent content, PrinterOptions options);

        /// <summary>
        /// Print a custom label
        /// </summary>
        /// <param name="lines"></param>
        /// <param name="options"></param>
        /// <returns></returns>
        Image<Rgba32> PrintLabel(ICollection<LineConfiguration> lines, PrinterOptions options);
    }
}

package parking;

import com.github.sarxos.webcam.Webcam;
import net.sourceforge.tess4j.Tesseract;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.Optional;

/** ANPR: webcam frame -> grayscale/upscale -> Tess4J OCR -> plate regex. Loaded by ParkingApp only if available. */
public class Tess4JPlateReader implements PlateReader {
    private final Tesseract ocr = new Tesseract();

    public Tess4JPlateReader(String tessdataDir) {
        ocr.setDatapath(tessdataDir);
        ocr.setLanguage("eng");
        ocr.setPageSegMode(7);
        ocr.setTessVariable("tessedit_char_whitelist", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    }

    @Override public BufferedImage capture() throws Exception {
        Webcam cam = Webcam.getDefault();
        if (cam == null) throw new IllegalStateException("No camera found");
        try { cam.open(); return cam.getImage(); } finally { cam.close(); }
    }

    @Override public Optional<String> read(BufferedImage src) throws Exception {
        int w = (int) (src.getWidth() * 0.7), h = (int) (src.getHeight() * 0.3);
        BufferedImage crop = src.getSubimage((src.getWidth() - w) / 2, (src.getHeight() - h) / 2, w, h);
        BufferedImage gray = new BufferedImage(w * 2, h * 2, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g = gray.createGraphics();
        g.drawImage(crop.getScaledInstance(w * 2, h * 2, java.awt.Image.SCALE_SMOOTH), 0, 0, Color.WHITE, null);
        g.dispose();
        String text = ParkingLot.normalize(ocr.doOCR(gray));
        java.util.regex.Matcher m = ParkingLot.PLATE.matcher(text);
        return m.find() ? Optional.of(m.group()) : Optional.empty();
    }
}

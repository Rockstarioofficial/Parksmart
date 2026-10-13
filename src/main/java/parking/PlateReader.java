package parking;

import java.awt.image.BufferedImage;
import java.util.Optional;

/** Plug-in point for automatic plate recognition (camera + OCR). */
public interface PlateReader {
    /** Grab one frame from the entry camera. */
    BufferedImage capture() throws Exception;
    /** Read a plate from an image; empty if none found. */
    Optional<String> read(BufferedImage image) throws Exception;
}

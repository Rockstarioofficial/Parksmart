package parking;

import java.io.File;
import java.util.Optional;
import java.util.Scanner;

/** Console app: manual entry always works; camera scan is used automatically when the ANPR module + camera exist. */
public class ParkingApp {
    public static void main(String[] args) {
        ParkingLot lot = new ParkingLot();
        PlateReader reader = null;
        try {
            reader = (PlateReader) Class.forName("parking.Tess4JPlateReader")
                    .getDeclaredConstructor(String.class).newInstance("tessdata");
            System.out.println("ANPR ready (camera scan enabled).");
        } catch (Throwable e) {
            System.out.println("ANPR not available - manual mode only.");
        }
        Scanner in = new Scanner(System.in);
        while (true) {
            System.out.println("\n1) Park (manual)  2) Park (camera scan)  3) Park (image file)  4) Check out  5) Status  0) Exit");
            System.out.print("> ");
            if (!in.hasNextLine()) return;
            String c = in.nextLine().trim();
            try {
                switch (c) {
                    case "1": park(lot, in, ParkingLot.normalize(ask(in, "Plate (e.g. TN30AB1234): "))); break;
                    case "2": park(lot, in, scan(reader, null)); break;
                    case "3": park(lot, in, scan(reader, new File(ask(in, "Image path: ")))); break;
                    case "4": {
                        Ticket t = lot.checkOut(ParkingLot.normalize(ask(in, "Plate: ")));
                        System.out.printf("Checked out %s - pay Rs.%.0f%n", t, t.getFee()); break;
                    }
                    case "5":
                        System.out.printf("Free %d/%d | parked %d | collected Rs.%.0f%n",
                                lot.free(), lot.total(), lot.activeTickets().size(), lot.revenue());
                        lot.activeTickets().forEach(t -> System.out.println("  " + t));
                        break;
                    case "0": return;
                    default: System.out.println("Choose 0-5.");
                }
            } catch (SlotNotAvailableException e) {
                System.out.println("Lot full: " + e.getMessage());
            } catch (Exception e) {
                System.out.println("Error: " + e.getMessage());
            }
        }
    }

    static String ask(Scanner in, String q) { System.out.print(q); return in.nextLine().trim(); }

    static String scan(PlateReader r, File file) throws Exception {
        if (r == null) throw new IllegalStateException("ANPR unavailable - use manual entry (option 1)");
        for (int i = 1; i <= 5; i++) {
            java.awt.image.BufferedImage img = file != null ? javax.imageio.ImageIO.read(file) : r.capture();
            Optional<String> p = r.read(img);
            if (p.isPresent()) { System.out.println("Detected: " + p.get()); return p.get(); }
            System.out.println("No plate found (try " + i + "/5)");
            if (file != null) break;
            Thread.sleep(1500);
        }
        throw new IllegalStateException("Could not read a plate - use manual entry");
    }

    static void park(ParkingLot lot, Scanner in, String plate) throws Exception {
        String ok = ask(in, "Confirm plate " + plate + "? (Enter = yes, or type the correct plate): ");
        if (!ok.isEmpty()) plate = ParkingLot.normalize(ok);
        String type = ask(in, "Type (car/bike/truck): ");
        System.out.println("Ticket " + lot.checkIn(Vehicle.of(type, plate)));
    }
}

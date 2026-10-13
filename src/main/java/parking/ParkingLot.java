package parking;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;

/** Collections: HashMap for slot lookup, ArrayList for history. */
public class ParkingLot {
    public static final Pattern PLATE = Pattern.compile("[A-Z0-9]{3,12}");
    private final Map<String, ParkingSlot> slots = new LinkedHashMap<>();
    private final Map<String, Ticket> active = new HashMap<>();
    private final List<Ticket> history = new ArrayList<>();
    private final FeeCalculator calc = new FeeCalculator();
    private int seq = 1000;

    public ParkingLot() {
        add("A", "bike", 8); add("B", "car", 12); add("C", "truck", 4);
    }
    private void add(String zone, String type, int n) {
        for (int i = 1; i <= n; i++) slots.put(zone + i, new ParkingSlot(zone + i, type));
    }

    public static String normalize(String s) { return s.toUpperCase().replaceAll("[^A-Z0-9]", ""); }
    public static boolean validPlate(String s) { return PLATE.matcher(s).matches(); }

    public Ticket checkIn(Vehicle v) throws SlotNotAvailableException {
        return checkIn(v, LocalDateTime.now());
    }
    public Ticket checkIn(Vehicle v, LocalDateTime when) throws SlotNotAvailableException {
        if (!validPlate(v.getPlate())) throw new IllegalArgumentException("Invalid plate: " + v.getPlate());
        if (active.containsKey(v.getPlate())) throw new IllegalStateException(v.getPlate() + " is already parked");
        ParkingSlot s = slots.values().stream()
                .filter(x -> x.isFree() && x.getType().equals(v.type())).findFirst()
                .orElseThrow(() -> new SlotNotAvailableException("No free " + v.type() + " slots"));
        Ticket t = new Ticket(++seq, v, s, when);
        s.occupy(t); active.put(v.getPlate(), t); v.park();
        return t;
    }
    public Ticket checkOut(String plate) { return checkOut(plate, LocalDateTime.now()); }
    public Ticket checkOut(String plate, LocalDateTime when) {
        Ticket t = active.remove(plate);
        if (t == null) throw new NoSuchElementException(plate + " is not parked");
        long mins = Duration.between(t.getIn(), when).toMinutes();
        t.close(when, calc.calculateFee(mins, t.getVehicle()));
        t.getSlot().release(); history.add(t);
        return t;
    }
    public Collection<Ticket> activeTickets() { return active.values(); }
    public List<Ticket> history() { return history; }
    public long free() { return slots.values().stream().filter(ParkingSlot::isFree).count(); }
    public int total() { return slots.size(); }
    public double revenue() { return history.stream().mapToDouble(Ticket::getFee).sum(); }
}

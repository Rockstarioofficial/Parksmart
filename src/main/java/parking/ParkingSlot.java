package parking;

/** Encapsulation: occupancy can only change through occupy()/release(). */
public class ParkingSlot {
    private final String id;
    private final String type;
    private Ticket current;
    public ParkingSlot(String id, String type) { this.id = id; this.type = type; }
    public String getId() { return id; }
    public String getType() { return type; }
    public boolean isFree() { return current == null; }
    public Ticket getCurrent() { return current; }
    void occupy(Ticket t) { current = t; }
    void release() { current = null; }
}

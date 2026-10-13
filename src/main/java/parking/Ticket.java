package parking;

import java.time.LocalDateTime;

public class Ticket {
    private final int id;
    private final Vehicle vehicle;
    private final ParkingSlot slot;
    private final LocalDateTime in;
    private LocalDateTime out;
    private double fee;
    Ticket(int id, Vehicle v, ParkingSlot s, LocalDateTime in) { this.id = id; vehicle = v; slot = s; this.in = in; }
    public int getId() { return id; }
    public Vehicle getVehicle() { return vehicle; }
    public ParkingSlot getSlot() { return slot; }
    public LocalDateTime getIn() { return in; }
    public LocalDateTime getOut() { return out; }
    public double getFee() { return fee; }
    void close(LocalDateTime out, double fee) { this.out = out; this.fee = fee; }
    @Override public String toString() {
        return "#" + id + " " + vehicle.getPlate() + " (" + vehicle.type() + ") slot " + slot.getId();
    }
}

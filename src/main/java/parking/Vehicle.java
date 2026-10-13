package parking;

/** Abstraction + inheritance: every vehicle type supplies its own rate. */
public abstract class Vehicle {
    private final String plate;
    protected Vehicle(String plate) { this.plate = plate; }
    public String getPlate() { return plate; }
    public abstract String type();
    public abstract double ratePerHour();
    public void park() { System.out.println(type() + " " + plate + " parked"); }

    public static Vehicle of(String type, String plate) {
        switch (type.toLowerCase()) {
            case "bike":  return new Bike(plate);
            case "truck": return new Truck(plate);
            default:      return new Car(plate);
        }
    }
}
class Car extends Vehicle {
    Car(String p) { super(p); }
    public String type() { return "car"; }
    public double ratePerHour() { return 20; }
    @Override public void park() { System.out.println("Car " + getPlate() + " in 4-wheeler bay"); }
}
class Bike extends Vehicle {
    Bike(String p) { super(p); }
    public String type() { return "bike"; }
    public double ratePerHour() { return 10; }
    @Override public void park() { System.out.println("Bike " + getPlate() + " in 2-wheeler bay"); }
}
class Truck extends Vehicle {
    Truck(String p) { super(p); }
    public String type() { return "truck"; }
    public double ratePerHour() { return 40; }
    @Override public void park() { System.out.println("Truck " + getPlate() + " in heavy-vehicle bay"); }
}

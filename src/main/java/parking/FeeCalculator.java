package parking;

/** Method overloading: same name, different parameter lists. Charged per started hour. */
public class FeeCalculator {
    public double calculateFee(long minutes) {
        return Math.max(1, Math.ceil(minutes / 60.0)) * 10;
    }
    public double calculateFee(long minutes, Vehicle v) {
        return Math.max(1, Math.ceil(minutes / 60.0)) * v.ratePerHour();
    }
}

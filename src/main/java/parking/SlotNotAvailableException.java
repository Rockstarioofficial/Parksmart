package parking;

public class SlotNotAvailableException extends Exception {
    private static final long serialVersionUID = 1L;
    public SlotNotAvailableException(String msg) { super(msg); }
}

package parking;

/** Error that maps to an HTTP status and a message shown to the user. */
class ApiEx extends Exception {
    private static final long serialVersionUID = 1L;
    final int status;
    ApiEx(int status, String msg) { super(msg); this.status = status; }
}

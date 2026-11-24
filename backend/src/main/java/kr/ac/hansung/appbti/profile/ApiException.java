package kr.ac.hansung.appbti.profile;

import org.springframework.http.HttpStatus;

/** 오류 본문 {status, code, message}로 바뀌는 예외. 400은 IllegalArgumentException을 잇는다. */
public class ApiException extends IllegalArgumentException {
    private final HttpStatus status;
    private final String code;

    // 상태·오류 코드·메시지로 예외를 만든다.
    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    // 400 잘못된 입력 예외를 만든다.
    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    // HTTP 상태를 돌려준다.
    public HttpStatus status() { return status; }

    // 오류 코드를 돌려준다.
    public String code() { return code; }
}

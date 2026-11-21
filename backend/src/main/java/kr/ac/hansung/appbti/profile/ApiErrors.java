package kr.ac.hansung.appbti.profile;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/** 모든 오류를 {status, code, message} 본문으로 돌려준다. */
@RestControllerAdvice
public class ApiErrors {
    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);

    // 오류 코드가 정해진 예외를 그대로 돌려준다.
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> api(ApiException error) {
        return body(error.status(), error.code(), error.getMessage());
    }

    // 코드 없이 던진 잘못된 입력을 400 INVALID_VALUE로 돌려준다.
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> invalid(IllegalArgumentException error) {
        return body(HttpStatus.BAD_REQUEST, "INVALID_VALUE", error.getMessage());
    }

    // 필수 쿼리 파라미터 누락을 400 MISSING_PARAMETER로 돌려준다.
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> missing(MissingServletRequestParameterException error) {
        return body(HttpStatus.BAD_REQUEST, "MISSING_PARAMETER", error.getParameterName() + "은(는) 필수입니다.");
    }

    // 쿼리 파라미터 타입 오류를 400 INVALID_VALUE로 돌려준다.
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> mismatch(MethodArgumentTypeMismatchException error) {
        return body(HttpStatus.BAD_REQUEST, "INVALID_VALUE", error.getName() + " 값의 형식이 올바르지 않습니다.");
    }

    // 읽을 수 없는 요청 본문을 400 MALFORMED_JSON으로 돌려준다.
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> malformed(HttpMessageNotReadableException error) {
        return body(HttpStatus.BAD_REQUEST, "MALFORMED_JSON", "요청 본문 JSON을 읽을 수 없습니다.");
    }

    // 지원하지 않는 Content-Type을 415로 돌려준다.
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> mediaType(HttpMediaTypeNotSupportedException error) {
        return body(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "Content-Type은 application/json이어야 합니다.");
    }

    // 지원하지 않는 메서드를 405로 돌려준다.
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> method(HttpRequestMethodNotSupportedException error) {
        return body(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "지원하지 않는 메서드입니다.");
    }

    // 없는 경로를 404 NOT_FOUND로 돌려준다.
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(NoResourceFoundException error) {
        return body(HttpStatus.NOT_FOUND, "NOT_FOUND", "없는 경로입니다.");
    }

    // 상태만 정한 예외를 그 상태로 돌려준다.
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> status(ResponseStatusException error) {
        HttpStatus status = HttpStatus.valueOf(error.getStatusCode().value());
        return body(status, status.name(), error.getReason() == null ? "요청을 처리할 수 없습니다." : error.getReason());
    }

    // 예상하지 못한 서버 오류를 500 INTERNAL_ERROR로 돌려준다.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception error) {
        log.error("처리하지 못한 오류", error);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "서버에서 요청을 처리하지 못했습니다.");
    }

    // 상태·코드·메시지로 오류 본문을 만든다.
    private static ResponseEntity<Map<String, Object>> body(HttpStatus status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status.value());
        body.put("code", code);
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}

package kr.ac.hansung.appbti.profile;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 파일은 기동 시 메모리에 적재한다. 실제 산출물이 없으면 별도 목업 산출물을 쓴다. */
@Component
public class ProfileRepository {
    private static final Logger log = LoggerFactory.getLogger(ProfileRepository.class);
    private final Map<String, ProfileData> datasets = new LinkedHashMap<>();

    public ProfileRepository(ObjectMapper mapper,
            @Value("${appbti.profiles-path}") String primary,
            @Value("${appbti.mock-profiles-path}") String mock,
            @Value("${appbti.mock-time-profiles-path}") String timed) throws IOException {
        boolean primaryExists = Files.isRegularFile(Path.of(primary));
        // 시연 중 목업으로 조용히 넘어가지 않도록 대체 사실을 경고로 남긴다.
        if (!primaryExists) log.warn("실제 산출물을 찾지 못해 목업 산출물을 사용합니다: {} 없음", Path.of(primary).toAbsolutePath().normalize());
        load(mapper, "basic", primaryExists ? Path.of(primary) : Path.of(mock));
        // 실제 데이터 모드에서는 가상 시간 데이터를 섞거나 선택할 수 없게 한다.
        if (datasets.containsKey("basic") && datasets.get("basic").meta().isMock()) {
            load(mapper, "time", Path.of(timed));
        }
        if (datasets.isEmpty()) log.warn("적재한 집단 통계가 없습니다. 조회 API는 503을 반환합니다.");
    }

    private void load(ObjectMapper mapper, String name, Path path) throws IOException {
        if (!Files.isRegularFile(path)) return;
        ProfileData data = mapper.readValue(path.toFile(), ProfileData.class);
        if (data.meta().schemaVersion() != 1 || data.meta().months().isEmpty() || data.meta().ageGroups().size() != 6) {
            throw new IOException("지원하지 않는 profiles.json 스키마: " + path);
        }
        datasets.put(name, data);
        log.info("집단 통계 적재 [{}]: {} ({}, 연령대 {}개, 중분류 {}개, {}~{})", name, path.toAbsolutePath().normalize(),
                data.meta().isMock() ? "목업" : "실제", data.meta().ageGroups().size(), data.meta().minorCategories().size(),
                data.meta().months().getFirst(), data.meta().latestMonth());
    }

    public ProfileData get(String dataset) {
        if (datasets.isEmpty()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "집단 통계를 준비하지 못했습니다. README의 목업 파이프라인을 먼저 실행하세요.");
        ProfileData data = datasets.get(dataset);
        if (data == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "제공하지 않는 데이터 버전입니다.");
        return data;
    }

    public List<String> availableDatasets() { return List.copyOf(datasets.keySet()); }

    public String month(ProfileData data, String requested) {
        String month = requested == null ? data.meta().latestMonth() : requested;
        if (!data.meta().months().contains(month)) throw new IllegalArgumentException("제공하지 않는 기준월입니다.");
        return month;
    }
}

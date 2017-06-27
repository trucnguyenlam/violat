package org.mje.blah;

import java.io.*;
import java.util.*;
import javax.json.*;
import org.apache.commons.cli.*;

public class Main {
    final static String PROGRAM_NAME = "jcsgen";
    final static String DESCRIPTION = "Harness generator";

    static Options getOptions() {
        Options options = new Options();

        options.addOption(Option.builder().longOpt("help").desc("print this message").build());

        options.addOption(Option.builder().longOpt("clang").desc("enable translator for C/C++ language").build());

        return options;
    }

    static void printHelp() {
        new HelpFormatter().printHelp(PROGRAM_NAME + " [options] < STDIN",
                DESCRIPTION + System.lineSeparator() + "options:", getOptions(), System.lineSeparator());

    }

    public static void main(String... args) {
        CommandLine line;

        try {
            line = new DefaultParser().parse(getOptions(), args);
        } catch (ParseException e) {
            line = null;
        }

        if (line == null || line.hasOption("help") || line.getArgs().length > 0 || System.console() != null) {
            printHelp();
            return;
        }

        boolean clang_support = false;

        // TRUC: Add options for C/C++ support
        if (line.hasOption("clang")) {
            clang_support = true;
        }

        Scanner scanner = new Scanner(System.in).useDelimiter("---");
        int status = 0;
        try {
            while (scanner.hasNext()) {
                try (JsonReader reader = Json.createReader(new StringReader(scanner.next()))) {
                    JsonObject o = reader.readObject();

                    Harness h = HarnessFactory.fromJson(o, clang_support);
                    int n = h.getLinearizations().size();
                    JsonWriter writer = Json.createWriter(System.out);
                    System.out.println("---");
                    writer.write(Results.add(o, h.getResults(), n));
                    System.out.println();
                }
            }
        } catch (Exception e) {
            System.err.println("Caught " + e);
            e.printStackTrace();
            status = 1;
        }

        System.exit(status);
    }
}

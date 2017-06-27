package org.mje.blah;

import java.util.*;
import java.util.stream.*;

public class InvocationSequence {
    List<Invocation> invocations;

    public InvocationSequence(List<Invocation> invocations) {
        this.invocations = Collections.unmodifiableList(invocations);
    }

    public InvocationSequence(Invocation... invocations) {
        this(Arrays.asList(invocations));
    }

    public InvocationSequence() {
        this(Collections.emptyList());
    }

    public List<Invocation> getInvocations() {
        return invocations;
    }

    public Invocation head() {
        return invocations.get(0);
    }

    public InvocationSequence tail() {
        List<Invocation> invocations = new LinkedList<>(this.invocations);
        invocations.remove(0);
        return new InvocationSequence(invocations);
    }

    public InvocationSequence snoc(Invocation i) {
        List<Invocation> invocations = new LinkedList<>(this.invocations);
        invocations.add(i);
        return new InvocationSequence(invocations);
    }

    public String toString() {
        return invocations.stream()
            .map(Invocation::toString)
            .collect(Collectors.joining("; "));
    }
}
